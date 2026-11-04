import type { Model, Transaction } from 'sequelize';
import { Member } from '../model/member';
import { MemberScore } from '../model/memberScore';

export interface ChangePointsResult {
  score: Model;
  /** 变更后的积分余额 */
  point: number;
}

/**
 * 统一积分变动入口：改 Member.point 与写 MemberScore 必须同事务，禁止只改一处。
 * delta 为负数表示扣减。
 */
export const changePoints = async (
  phone: string,
  delta: number,
  type: string,
  reason: string,
  extra?: unknown,
  transaction?: Transaction,
): Promise<ChangePointsResult> => {
  await Member.increment({ point: delta }, { where: { phone }, transaction });

  const score = await MemberScore.create(
    {
      phone,
      point: delta,
      type,
      reason,
      extra: extra === undefined ? null : JSON.stringify(extra),
    },
    { transaction },
  );

  const member = await Member.findOne({ where: { phone }, transaction });
  return { score, point: Number(member?.get('point') ?? 0) };
};
