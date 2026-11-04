/**
 * JWT 签发与校验。
 * 密钥来自 ~/.nova/server-config.json 的 auth.jwtSecret，由服务端自动生成。
 */
import jwt from 'jsonwebtoken';

import { getJwtSecret } from '../config';

export type SessionRole = 'admin' | 'clerk';

export type SessionPayload = {
  sub: string;
  username: string;
  role: SessionRole;
};

/**
 * 令牌有效期：30 天，桌面端与手机端共用。
 * 桌面端长期在线时仍由主进程用内部令牌自动续签，30 天只是兜底；
 * 手机端没有续签通道，30 天避免店员每天重新登录。
 */
export const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: TOKEN_TTL_SECONDS,
    issuer: 'nova-pos-server',
  });
}

/** 校验签名与有效期；失败返回 null，由调用方统一返回 401 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), { issuer: 'nova-pos-server' });
    if (typeof decoded === 'string') return null;

    const { sub, username, role } = decoded as Partial<SessionPayload> & { sub?: unknown };
    if (typeof sub !== 'string' || typeof username !== 'string') return null;
    if (role !== 'admin' && role !== 'clerk') return null;

    return { sub, username, role };
  } catch {
    return null;
  }
}
