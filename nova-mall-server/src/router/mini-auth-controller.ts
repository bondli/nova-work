import type { Request, Response } from 'express';
import { z } from 'zod';
import { Member } from '../model/member';
import { MemberIdentity } from '../model/memberIdentity';
import { sequelize } from '../model/index';
import { toMemberSummary } from '../service/member-view';
import { signMemberToken } from '../service/jwt';
import { changePoints } from '../service/points';
import { code2Session, getPhoneByPhoneCode } from '../service/wechat-auth';
import { handle } from '../utils/async-handler';
import { parseBody } from '../utils/query';

const loginSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
  phoneCode: z.string().min(1, 'phoneCode 不能为空'),
});

const silentSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
});

/** 微信授权手机号登录：手机号即会员号，未注册时自动创建普通会员 */
export const miniLogin = handle(async (req: Request, res: Response) => {
  const body = parseBody(loginSchema, req.body, res);
  if (!body) return;

  const session = await code2Session(body.code);
  const phone = await getPhoneByPhoneCode(body.phoneCode);

  // 首次登录即注册：phone 唯一索引兜底并发，findOrCreate 命中已存在时复用原会员；
  // 新建会员赠送 10 积分（入会赠送），积分余额与流水同事务写入
  const [member] = await sequelize.transaction(async (transaction) => {
    const [model, created] = await Member.findOrCreate({
      where: { phone },
      defaults: {
        phone,
        actual: 0,
        point: 0,
        balance: 0,
        coupon: 0,
        level: 'normal',
        status: 'normal',
      },
      transaction,
    });

    if (created) {
      await changePoints(phone, 10, 'earn', '入会赠送', { source: 'mini-login' }, transaction);
      // 重新读取数据库中的积分，避免返回给客户端的还是创建时的 0
      await model.reload({ transaction });
    }

    return [model, created] as const;
  });

  // openid ↔ phone 绑定用于后续静默续期；同一 openid 换绑时覆盖旧手机号
  await MemberIdentity.upsert({
    openid: session.openid,
    phone,
    unionId: session.unionid ?? null,
  });

  const { token, expiresIn } = signMemberToken(phone, session.openid);
  res.json({ success: true, data: { token, expiresIn, member: toMemberSummary(member) } });
});

/** 静默登录：openid 已绑定则直接续期，未绑定返回 needPhoneAuth */
export const miniSilent = handle(async (req: Request, res: Response) => {
  const body = parseBody(silentSchema, req.body, res);
  if (!body) return;

  const session = await code2Session(body.code);
  const identity = await MemberIdentity.findOne({ where: { openid: session.openid } });

  if (!identity) {
    res.json({ success: true, data: { needPhoneAuth: true } });
    return;
  }

  const phone = identity.get('phone') as string;
  const member = await Member.findOne({ where: { phone } });
  if (!member) {
    res.json({ success: true, data: { needPhoneAuth: true } });
    return;
  }

  const { token, expiresIn } = signMemberToken(phone, session.openid);
  res.json({ success: true, data: { token, expiresIn, member: toMemberSummary(member) } });
});
