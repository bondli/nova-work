import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getMiniConfig } from '../config';

const UNAUTHORIZED_BODY = {
  success: false,
  code: 'UNAUTHORIZED',
  message: '登录已过期，请重新授权',
};

/** Bearer token 鉴权：HS256 校验，成功注入 req.member = { phone, openid } */
export const auth = (req: Request, res: Response, next: NextFunction): void => {
  const member = readTokenMember(req);
  if (!member) {
    res.status(401).json(UNAUTHORIZED_BODY);
    return;
  }
  req.member = member;
  next();
};

/** 可选鉴权：带合法 token 时注入会员信息，未登录/非法 token 直接放行（公开页展示领取状态用） */
export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const member = readTokenMember(req);
  if (member) req.member = member;
  next();
};

/** 解析 Bearer token；缺失、过期或签名错误都返回 null，由调用方决定是否拦截 */
const readTokenMember = (req: Request): { phone: string; openid: string } | null => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  try {
    const payload = jwt.verify(token, getMiniConfig().jwt.secret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    const openid = (payload as jwt.JwtPayload & { openid?: unknown }).openid;
    return {
      phone: payload.sub,
      openid: typeof openid === 'string' ? openid : '',
    };
  } catch {
    return null;
  }
};
