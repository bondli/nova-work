import type { Request, Response } from 'express';
import dayjs from 'dayjs';
import { Marketing } from '../model/marketing';
import { StoreCoupon } from '../model/storeCoupon';
import { MemberCoupon } from '../model/memberCoupon';
import { sequelize } from '../model/index';
import { issueCoupon } from '../service/coupon';
import { toMiniAssetUrl } from '../service/mini-assets';
import { handle } from '../utils/async-handler';

/**
 * 活动券在 MemberCoupon 中的唯一标识。
 * 用店铺券 ID 做幂等键，保证同一活动券每位会员只能领取一次。
 */
const claimKey = (storeCouponId: number): string => `store-coupon:${storeCouponId}`;

const toNumber = (value: unknown): number => Number(value ?? 0);

/** 金额/时间统一转成前端易读格式 */
const formatDate = (value: unknown): string | null =>
  value ? dayjs(value as Date | string).format('YYYY-MM-DD HH:mm:ss') : null;

/**
 * 活动详情（公开）：展示活动 banner、营销信息与关联优惠券。
 * 带合法 token 时额外返回每张券的领取状态，未登录也可浏览。
 */
export const getMiniActivityDetail = handle(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).json({ success: false, code: 'ACTIVITY_NOT_FOUND', message: '活动不存在或已下线' });
    return;
  }

  const marketing = await Marketing.findByPk(id);
  if (!marketing) {
    res.status(404).json({ success: false, code: 'ACTIVITY_NOT_FOUND', message: '活动不存在或已下线' });
    return;
  }

  const couponRows = await StoreCoupon.findAll({
    where: { activityId: id, couponStatus: 'active' },
    order: [['id', 'ASC']],
  });

  const phone = req.member?.phone;
  const claimedKeys = new Set<string>();
  if (phone && couponRows.length) {
    const owned = await MemberCoupon.findAll({
      where: { phone, couponId: couponRows.map((row) => claimKey(Number(row.get('id')))) },
      attributes: ['couponId'],
    });
    owned.forEach((item) => claimedKeys.add(String(item.get('couponId'))));
  }

  const now = dayjs();
  res.json({
    success: true,
    data: {
      id,
      name: String(marketing.get('marketingName') ?? ''),
      description: String(marketing.get('marketingDesc') ?? ''),
      theme: marketing.get('marketingTheme') ?? null,
      image: toMiniAssetUrl(String(marketing.get('marketingImage') ?? '')),
      type: String(marketing.get('marketingType') ?? ''),
      condition: toNumber(marketing.get('marketingCondition')),
      value: toNumber(marketing.get('marketingValue')),
      startTime: formatDate(marketing.get('startTime')),
      endTime: formatDate(marketing.get('endTime')),
      coupons: couponRows.map((row) => {
        const couponId = Number(row.get('id'));
        const expiredAt = row.get('couponExpiredTime') as Date | null;
        return {
          id: couponId,
          desc: String(row.get('couponDesc') ?? ''),
          condition: row.get('couponCondition') == null ? null : Number(row.get('couponCondition')),
          value: toNumber(row.get('couponValue')),
          expiredTime: expiredAt ? dayjs(expiredAt).format('YYYY-MM-DD') : null,
          expired: expiredAt ? dayjs(expiredAt).isBefore(now) : false,
          claimed: claimedKeys.has(claimKey(couponId)),
        };
      }),
    },
  });
});

/**
 * 领取活动券：写 MemberCoupon 并累加会员券数量。
 * 幂等键为 claimKey，重复领取返回 409；已过期/已下架的券不可领取。
 */
export const postMiniActivityCouponClaim = handle(async (req: Request, res: Response) => {
  const phone = req.member?.phone;
  if (!phone) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: '登录已过期，请重新授权' });
    return;
  }

  const activityId = Number(req.params.id);
  const couponId = Number(req.params.couponId);
  if (!Number.isInteger(activityId) || !Number.isInteger(couponId)) {
    res.status(400).json({ success: false, code: 'INVALID_COUPON', message: '优惠券不存在' });
    return;
  }

  const coupon = await StoreCoupon.findOne({
    where: { id: couponId, activityId, couponStatus: 'active' },
  });
  if (!coupon) {
    res.status(404).json({ success: false, code: 'COUPON_NOT_FOUND', message: '优惠券不存在或已下架' });
    return;
  }

  const expiredAt = coupon.get('couponExpiredTime') as Date | null;
  if (expiredAt && dayjs(expiredAt).isBefore(dayjs())) {
    res.status(400).json({ success: false, code: 'COUPON_EXPIRED', message: '优惠券已过期' });
    return;
  }

  const key = claimKey(couponId);
  const existing = await MemberCoupon.findOne({ where: { phone, couponId: key } });
  if (existing) {
    res.status(409).json({ success: false, code: 'ALREADY_CLAIMED', message: '该优惠券已领取' });
    return;
  }

  await sequelize.transaction(async (transaction) => {
    await issueCoupon(
      phone,
      {
        couponId: key,
        condition: coupon.get('couponCondition') == null ? null : Number(coupon.get('couponCondition')),
        value: toNumber(coupon.get('couponValue')),
        desc: String(coupon.get('couponDesc') ?? '活动优惠券'),
        // 领取后有效期不超过券本身的有效期
        validDays: expiredAt ? Math.max(1, dayjs(expiredAt).diff(dayjs(), 'day')) : undefined,
        extra: { activityId, storeCouponId: couponId },
      },
      transaction,
    );
  });

  res.json({ success: true, data: { couponId, claimed: true } });
});
