import crypto from 'node:crypto';
import dayjs from 'dayjs';
import type { Model, Transaction } from 'sequelize';
import { Member } from '../model/member';
import { MemberCoupon } from '../model/memberCoupon';

export interface IssueCouponInput {
  condition: number | null;
  value: number;
  desc: string;
  validDays?: number;
  extra?: unknown;
  /** 指定券标识（如活动券领取做幂等键）；缺省用 uuid */
  couponId?: string;
}

/**
 * 发券到 MemberCoupon：uuid 生成 couponId，状态 active，有效期按天计算；
 * 同时累加 Member.coupon 计数，保证会员券数量与实际记录一致。
 */
export const issueCoupon = async (
  phone: string,
  input: IssueCouponInput,
  transaction?: Transaction,
): Promise<Model> => {
  const validDays = Number(input.validDays) > 0 ? Number(input.validDays) : 30;

  const coupon = await MemberCoupon.create(
    {
      phone,
      couponId: input.couponId ?? crypto.randomUUID(),
      couponCondition: input.condition,
      couponDesc: input.desc,
      couponValue: input.value,
      couponCount: 1,
      couponStatus: 'active',
      couponExpiredTime: dayjs().add(validDays, 'day').format('YYYY-MM-DD HH:mm:ss'),
      extra: input.extra === undefined ? null : JSON.stringify(input.extra),
    },
    { transaction },
  );

  await Member.increment('coupon', { where: { phone }, transaction });
  return coupon;
};
