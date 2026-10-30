import { Response } from 'express';

// 统一响应格式的工具函数

// 成功响应
export const success = (res: Response, data?: any, message = 'success'): void => {
  res.status(200).json({ code: 0, message, data });
};

// 分页成功响应
export const successWithPage = (res: Response, data: any[], count: number): void => {
  res.status(200).json({ code: 0, message: 'success', data, count });
};

// 失败响应
export const fail = (res: Response, code: number, message: string): void => {
  res.status(code).json({ code, message });
};

// 快捷方法

// 400 - 请求参数错误
export const badRequest = (res: Response, message: string) => fail(res, 400, message);

// 401 - 未认证
export const unauthorized = (res: Response, message = 'Unauthorized') => fail(res, 401, message);

// 403 - 无权限
export const forbidden = (res: Response, message = 'Forbidden') => fail(res, 403, message);

// 404 - 资源不存在
export const notFound = (res: Response, message = 'Not found') => fail(res, 404, message);

// 500 - 服务器内部错误
export const serverError = (res: Response, message = 'Internal server error') => fail(res, 500, message);
