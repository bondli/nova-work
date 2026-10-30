import { Request, Response, NextFunction } from 'express';
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  userId?: string;
  userOS?: string;
  appVersion?: string;
  request?: Request;
}

// 创建异步本地存储实例
const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 从请求头中提取上下文信息
 */
const extractContextFromRequest = (req: Request): RequestContext => {
  return {
    userId: req.headers['x-user-id'] as string,
    userOS: req.headers['x-client-os'] as string,
    appVersion: req.headers['x-client-version'] as string,
    request: req,
  };
};

/**
 * 运行带有请求上下文的函数
 */
const runWithContext = <T>(context: RequestContext, fn: () => T): T => {
  return asyncLocalStorage.run(context, fn);
};

/**
 * 请求上下文中间件
 * 从请求头中提取用户信息并存储到异步本地存储中
 */
export const contextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const context = extractContextFromRequest(req);
  
  // 在异步本地存储中运行后续的请求处理
  runWithContext(context, () => {
    next();
  });
};

// 导出异步本地存储实例供其他模块使用
export { asyncLocalStorage };