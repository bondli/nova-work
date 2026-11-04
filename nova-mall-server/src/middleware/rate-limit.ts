import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** 统计窗口，默认 1 分钟 */
  windowMs?: number;
  /** 窗口内最大请求次数 */
  max: number;
  /** 计数维度，如 IP 或手机号 */
  key: (req: Request) => string;
}

const RATE_LIMITED_BODY = {
  success: false,
  code: 'RATE_LIMITED',
  message: '请求过于频繁，请稍后再试',
};

/** 内存计数限流（单机够用，重启失效） */
export const createRateLimit = (options: RateLimitOptions) => {
  const windowMs = options.windowMs ?? 60_000;
  const buckets = new Map<string, Bucket>();
  let lastSweep = Date.now();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    // 定期清理过期计数，避免内存随访问量无限增长
    if (now - lastSweep > windowMs) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
      lastSweep = now;
    }

    const key = options.key(req);
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      res.status(429).json(RATE_LIMITED_BODY);
      return;
    }

    bucket.count += 1;
    next();
  };
};

/** 登录限流：10 次 / 分钟 / IP */
export const loginRateLimit = createRateLimit({
  max: 10,
  key: (req) => `login:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`,
});

/** 抽奖 / 兑换限流：10 次 / 分钟 / 手机号（鉴权后 req.member 必存在） */
export const memberActionRateLimit = createRateLimit({
  max: 10,
  key: (req) => `member:${req.member?.phone ?? (req.ip ?? 'unknown')}`,
});
