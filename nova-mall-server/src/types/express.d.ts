import 'express';

declare global {
  namespace Express {
    interface Request {
      /** 由 auth 中间件注入，路由挂载 auth 后必然存在 */
      member?: { phone: string; openid: string };
    }
  }
}
