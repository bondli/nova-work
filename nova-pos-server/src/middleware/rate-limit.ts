/**
 * 极简内存限流：用于登录等免 JWT 的公开端点，防止口令爆破。
 * 单实例、单进程足够；多实例部署时需要换成 Redis 等共享存储。
 */
import { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** 统计窗口，毫秒 */
  windowMs: number;
  /** 窗口内允许的最大次数 */
  max: number;
  /** 返回给前端的中文提示 */
  message?: string;
}

/** 每 5 分钟最多 10 次尝试，覆盖单 IP 的口令爆破场景 */
export const LOGIN_RATE_LIMIT: RateLimitOptions = {
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: '登录尝试过于频繁，请 5 分钟后再试',
};

export const createRateLimit = (options: RateLimitOptions) => {
  const buckets = new Map<string, Bucket>();
  let lastCleanupAt = 0;

  return (request: Request, response: Response, next: NextFunction): void => {
    const now = Date.now();

    // 每分钟最多清理一次，避免每个请求都全量遍历 Map
    if (now - lastCleanupAt >= 60_000) {
      lastCleanupAt = now;
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    // 优先按 账号 + IP 组合限流：同一出口 IP 的多个店员互不影响
    const name = typeof request.body?.username === 'string' ? request.body.username.trim() : '';
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const key = `${ip}|${name.toLowerCase()}`;

    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      response.setHeader('Retry-After', String(retryAfter));
      response.status(429).json({
        code: 429,
        message: options.message ?? '请求过于频繁，请稍后再试',
      });
      return;
    }

    bucket.count += 1;
    next();
  };
};
