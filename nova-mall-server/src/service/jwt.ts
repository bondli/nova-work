import jwt from 'jsonwebtoken';
import { getMiniConfig } from '../config';

export interface MiniTokenResult {
  token: string;
  /** 有效期秒数，登录接口契约固定返回 604800（7 天） */
  expiresIn: number;
}

/** 签发会员 token：HS256，sub=手机号，payload 带 openid */
export const signMemberToken = (phone: string, openid: string): MiniTokenResult => {
  const { secret, expiresIn } = getMiniConfig().jwt;
  const token = jwt.sign({ openid }, secret, {
    algorithm: 'HS256',
    subject: phone,
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });

  const decoded = jwt.decode(token);
  const seconds =
    decoded && typeof decoded === 'object' && decoded.exp && decoded.iat
      ? decoded.exp - decoded.iat
      : 604800;

  return { token, expiresIn: seconds };
};
