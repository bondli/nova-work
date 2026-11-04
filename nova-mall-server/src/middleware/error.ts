import type { NextFunction, Request, Response } from 'express';
import logger from '../logger';

/** 业务错误：携带 HTTP 状态与 /mini 契约错误码，由控制器统一转换为 JSON 响应 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 统一失败响应：业务错误原样返回，未知错误一律 500 且不泄露堆栈 */
export const sendError = (res: Response, error: unknown): void => {
  if (res.headersSent) return;

  if (error instanceof AppError) {
    res.status(error.status).json({ success: false, code: error.code, message: error.message });
    return;
  }

  logger.error(
    'Unexpected error:',
    error instanceof Error ? error.message : error,
    error instanceof Error ? error.stack : undefined,
  );
  res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: '服务器内部错误' });
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, code: 'NOT_FOUND', message: '接口不存在' });
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  sendError(res, error);
};
