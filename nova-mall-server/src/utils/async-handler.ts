import type { NextFunction, Request, Response } from 'express';
import { sendError } from '../middleware/error';

/** 统一异步控制器包装：捕获 Promise 异常并按 /mini 契约输出 */
export const handle =
  (fn: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, _next: NextFunction): void => {
      fn(req, res).catch((error) => sendError(res, error));
    };
