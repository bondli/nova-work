import dayjs from 'dayjs';
import type { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { AppError } from '../middleware/error';
import { Inventory } from '../model/inventory';
import { Member } from '../model/member';
import { MemberBalance } from '../model/memberBalance';
import { MemberCoupon } from '../model/memberCoupon';
import { MemberDrawRecord } from '../model/memberDrawRecord';
import { MemberScore } from '../model/memberScore';
import { Order } from '../model/order';
import { OrderItems } from '../model/orderItems';
import { memberNotFound, toMemberSummary } from '../service/member-view';
import { handle } from '../utils/async-handler';
import { parseBody, resolvePagination } from '../utils/query';

const profileSchema = z.object({
  name: z.string().trim().min(1, '昵称不能为空').max(16, '昵称最长 16 个字').optional(),
  birthday: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '生日格式应为 YYYY-MM-DD')
    .optional(),
});

const ORDER_STATUS = ['uncheck', 'checked', 'refund'];
const COUPON_STATUS = ['active', 'used', 'expired'];

const getMemberByPhone = async (phone: string) => {
  const member = await Member.findOne({ where: { phone } });
  if (!member) throw memberNotFound();
  return member;
};

/** 会员资料摘要 */
export const getMiniProfile = handle(async (req: Request, res: Response) => {
  const member = await getMemberByPhone(req.member!.phone);
  res.json({ success: true, data: toMemberSummary(member) });
});

/** 修改资料：仅允许昵称（1-16 字）与生日（YYYY-MM-DD） */
export const updateMiniProfile = handle(async (req: Request, res: Response) => {
  const body = parseBody(profileSchema, req.body, res);
  if (!body) return;

  const member = await getMemberByPhone(req.member!.phone);
  const changes: Record<string, string> = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.birthday !== undefined) changes.birthday = body.birthday;

  if (Object.keys(changes).length > 0) {
    await member.update(changes);
  }

  res.json({ success: true, data: toMemberSummary(member) });
});

/** 购物记录：仅 orderType='normal' 且属于当前会员 */
export const getMiniOrders = handle(async (req: Request, res: Response) => {
  const phone = req.member!.phone;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);
  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' && rawStatus !== 'all' ? rawStatus : undefined;

  if (status && !ORDER_STATUS.includes(status)) {
    throw new AppError(400, 'INVALID_PARAMS', '不支持的订单状态');
  }

  const where: Record<string, unknown> = { userPhone: phone, orderType: 'normal' };
  if (status) where.orderStatus = status;

  const { count, rows } = await Order.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  res.json({ success: true, data: rows, count });
});

/** 订单详情：校验归属，非本人订单一律 404 */
export const getMiniOrderDetail = handle(async (req: Request, res: Response) => {
  const phone = req.member!.phone;
  const orderSn = req.params.orderSn;

  const order = await Order.findOne({ where: { orderSn, userPhone: phone, orderType: 'normal' } });
  if (!order) {
    throw new AppError(404, 'ORDER_NOT_FOUND', '订单不存在');
  }

  const items = await OrderItems.findAll({
    where: { orderSn },
    order: [['createdAt', 'DESC']],
  });

  // OrderItems 写入的品牌/名称可能乱码，按 SKU 从 Inventory 覆盖展示字段
  if (items.length > 0) {
    const skus = items.map((item) => item.get('sku') as string);
    const inventoryList = await Inventory.findAll({ where: { sku: { [Op.in]: skus } } });
    const inventoryMap = new Map(inventoryList.map((item) => [item.get('sku') as string, item]));
    for (const item of items) {
      const inventory = inventoryMap.get(item.get('sku') as string);
      if (inventory) {
        item.setDataValue('brand', inventory.get('brand'));
        item.setDataValue('name', inventory.get('name'));
        item.setDataValue('size', inventory.get('size'));
        item.setDataValue('color', inventory.get('color'));
      }
    }
  }

  res.json({ success: true, data: { order: order.toJSON(), items: items.map((item) => item.toJSON()) } });
});

/** 积分流水 */
export const getMiniPoints = handle(async (req: Request, res: Response) => {
  const phone = req.member!.phone;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);

  const { count, rows } = await MemberScore.findAndCountAll({
    where: { phone },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  res.json({ success: true, data: rows, count });
});

/** 店内余额流水 */
export const getMiniBalance = handle(async (req: Request, res: Response) => {
  const phone = req.member!.phone;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);

  const { count, rows } = await MemberBalance.findAndCountAll({
    where: { phone },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  res.json({ success: true, data: rows, count });
});

/** 优惠券：不传 status 或传 all 时返回全部；active 额外排除已过期的券，expired 含状态过期与有效期已过的 active 券 */
export const getMiniCoupons = handle(async (req: Request, res: Response) => {
  const phone = req.member!.phone;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);
  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' && rawStatus ? rawStatus : 'all';

  if (status !== 'all' && !COUPON_STATUS.includes(status)) {
    throw new AppError(400, 'INVALID_PARAMS', '不支持的优惠券状态');
  }

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const where =
    status === 'all'
      ? { phone }
      : status === 'active'
        ? { phone, couponStatus: 'active', couponExpiredTime: { [Op.gt]: now } }
        : status === 'used'
          ? { phone, couponStatus: 'used' }
          : {
              phone,
              [Op.or]: [
                { couponStatus: 'expired' },
                { couponStatus: 'active', couponExpiredTime: { [Op.lte]: now } },
              ],
            };

  const { count, rows } = await MemberCoupon.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  res.json({ success: true, data: rows, count });
});

const safeParseExtra = (value: unknown): unknown => {
  if (typeof value !== 'string' || !value) return null;
  try {
    return JSON.parse(value);
  } catch {
    // 历史数据格式异常时不阻断列表
    return value;
  }
};

/** 抽奖记录：解析 extra JSON，解析失败保留原值 */
export const getMiniDraws = handle(async (req: Request, res: Response) => {
  const phone = req.member!.phone;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);

  const { count, rows } = await MemberDrawRecord.findAndCountAll({
    where: { phone },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  const data = rows.map((row) => {
    const json = row.toJSON() as Record<string, unknown>;
    return { ...json, extra: safeParseExtra(json.extra) };
  });

  res.json({ success: true, data, count });
});
