/**
 * 会话换取接口。
 * 由可信的内部调用方（桌面端主进程）携带 x-nova-token 调用，
 * 服务端签名后返回 JWT；渲染层拿不到内部令牌，也无法自行签发。
 */
import { Request, Response } from 'express';
import { z } from 'zod';

import logger from '../logger';
import { User } from '../model/user';
import { hashPassword, isHashedPassword, verifyPassword } from '../auth/password';
import { signSessionToken, TOKEN_TTL_SECONDS } from '../auth/jwt';
import { getRelayUrl, getShareGroupToken } from '../config';

const sessionRequestSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  role: z.enum(['admin', 'clerk']),
});

const mobileLoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const issueSessionToken = (request: Request, response: Response): void => {
  const parsed = sessionRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 400, message: '身份参数不合法' });
    return;
  }

  const { userId, username, role } = parsed.data;

  response.json({
    token: signSessionToken({ sub: userId, username, role }),
    expiresIn: TOKEN_TTL_SECONDS,
  });
};

/**
 * 手机端登录：账号口令校验 + 直接签发 JWT，一次请求完成。
 * 手机端无法持有内部令牌（x-nova-token），因此本端点不依赖内部鉴权，
 * 改为账号口令 + 调用方限流（见 middleware/rate-limit.ts）。
 */
export const mobileLogin = async (request: Request, response: Response): Promise<void> => {
  const parsed = mobileLoginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ code: 400, message: '请输入用户名和密码' });
    return;
  }

  const { username, password } = parsed.data;

  try {
    const result: any = await User.findOne({ where: { name: username.trim() } });
    if (!result || !verifyPassword(result.password, password)) {
      response.status(401).json({ code: 401, message: '用户名或密码错误' });
      return;
    }
    if (result.status !== 'normal') {
      response.status(403).json({ code: 403, message: '账号已停用，请联系管理员' });
      return;
    }

    if (!isHashedPassword(result.password)) {
      // 老库明文密码：首次登录成功后立即落成哈希
      await result.update({ password: hashPassword(password) });
    }

    const user = result.toJSON();
    const role = user.role === 'admin' ? 'admin' : 'clerk';

    response.json({
      token: signSessionToken({ sub: String(user.id), username: user.name, role }),
      expiresIn: TOKEN_TTL_SECONDS,
      user: {
        id: String(user.id),
        name: user.name,
        realName: user.realName ?? null,
        avatar: user.avatar ?? null,
        role,
      },
    });
  } catch (error) {
    logger.error('[Pos Server] Mobile login failed:');
    console.log(error);
    response.status(500).json({ code: 500, message: '服务暂时不可用，请稍后重试' });
  }
};

/**
 * 文件共享群组令牌：桌面端（内部令牌）与手机端（JWT）共用此 handler。
 * 返回 groupToken（供 nova-relay 鉴权分组）与 relayUrl。
 */
export const issueShareToken = (_request: Request, response: Response): void => {
  response.json({
    groupToken: getShareGroupToken(),
    relayUrl: getRelayUrl(),
  });
};
