import type { Model } from 'sequelize';
import { AppError } from '../middleware/error';

/** 会员摘要：登录 / 资料接口统一输出，不含敏感字段 */
export interface MemberSummary {
  phone: string;
  name: string;
  birthday: string;
  level: string;
  point: number;
  balance: number;
  coupon: number;
  actual: number;
}

export const toMemberSummary = (member: Model): MemberSummary => ({
  phone: (member.get('phone') as string) ?? '',
  name: (member.get('name') as string) ?? '',
  birthday: (member.get('birthday') as string) ?? '',
  level: (member.get('level') as string) ?? 'normal',
  point: Number(member.get('point') ?? 0),
  balance: Number(member.get('balance') ?? 0),
  coupon: Number(member.get('coupon') ?? 0),
  actual: Number(member.get('actual') ?? 0),
});

/** 会员不存在时统一 404 MEMBER_NOT_FOUND */
export const memberNotFound = (): AppError =>
  new AppError(404, 'MEMBER_NOT_FOUND', '该手机号还不是门店会员，请先到店登记');
