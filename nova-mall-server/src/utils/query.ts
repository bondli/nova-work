import type { Response } from 'express';
import type { ZodType } from 'zod';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export interface Pagination {
  limit: number;
  offset: number;
}

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/** 统一分页解析：默认 20 条、上限 100 条，避免 NaN 或不传 pageSize 时全表返回 */
export const resolvePagination = (
  query: Record<string, unknown>,
  options: { defaultPageSize?: number; maxPageSize?: number } = {},
): Pagination => {
  const defaultPageSize = options.defaultPageSize ?? DEFAULT_PAGE_SIZE;
  const maxPageSize = options.maxPageSize ?? MAX_PAGE_SIZE;
  const current = toPositiveInt(query.current, 1);
  const pageSize = Math.min(toPositiveInt(query.pageSize, defaultPageSize), maxPageSize);
  return { limit: pageSize, offset: (current - 1) * pageSize };
};

/** 请求体校验：失败时按 /mini 契约回 400 并返回 null */
export const parseBody = <T>(schema: ZodType<T>, body: unknown, response: Response): T | null => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    response.status(400).json({
      success: false,
      code: 'INVALID_PARAMS',
      message: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    });
    return null;
  }
  return parsed.data;
};
