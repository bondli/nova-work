import type { Request, Response } from 'express';
import { z } from 'zod';
import { Member } from '../model/member';
import { MemberIdentity } from '../model/memberIdentity';
import { memberNotFound, toMemberSummary } from '../service/member-view';
import { signMemberToken } from '../service/jwt';
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

/** 微信授权手机号登录：非会员不创建会员，直接提示到店登记 */
export const miniLogin = handle(async (req: Request, res: Response) => {
  const body = parseBody(loginSchema, req.body, res);
  if (!body) return;

  const session = await code2Session(body.code);
  const phone = await getPhoneByPhoneCode(body.phoneCode);

  const member = await Member.findOne({ where: { phone } });
  if (!member) throw memberNotFound();

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
