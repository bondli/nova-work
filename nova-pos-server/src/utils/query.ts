import type { Response } from 'express';
import { Op } from 'sequelize';
import type { ZodType } from 'zod';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export interface Pagination {
  limit: number;
  offset: number;
}

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

/** 统一分页解析：默认 20 条、上限 200 条，避免 NaN 或不传 pageSize 时全表返回 */
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

const SAFE_COLUMN = /^[A-Za-z][A-Za-z0-9_]*$/;
const SAFE_DIRECTION = /^(ASC|DESC)$/i;

/** 排序字段白名单：只接受 `字段 ASC|DESC`，非法输入回退默认排序，避免注入 */
export const resolveOrderBy = (
  orderby: unknown,
  allowedColumns: string[],
  fallback: [string, 'ASC' | 'DESC'] = ['createdAt', 'DESC'],
): [string, 'ASC' | 'DESC'][] => {
  if (typeof orderby !== 'string' || !orderby.trim()) {
    return [fallback];
  }

  const [column, direction = fallback[1]] = orderby.trim().split(/\s+/);
  if (!SAFE_COLUMN.test(column) || !allowedColumns.includes(column) || !SAFE_DIRECTION.test(direction)) {
    return [fallback];
  }

  return [[column, direction.toUpperCase() as 'ASC' | 'DESC']];
};

/** 大列表按固定块大小切分，用于 IN 查询分批，避免超长 SQL */
export const chunkArray = <T>(items: T[], size = 500): T[][] => {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

interface FindAllModel {
  findAll: (options: Record<string, unknown>) => Promise<unknown[]>;
}

/** 按 IN 字段分批查询后合并结果，避免一次 IN 传入几千个值 */
export const findAllByInChunks = async (
  model: FindAllModel,
  field: string,
  values: unknown[],
  options: Record<string, unknown> = {},
  size = 500,
): Promise<unknown[]> => {
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.length === 0) return [];

  const results: unknown[] = [];
  for (const group of chunkArray(uniqueValues, size)) {
    const rows = await model.findAll({
      ...options,
      where: {
        ...(options.where as Record<string, unknown> | undefined),
        [field]: { [Op.in]: group },
      },
    });
    results.push(...rows);
  }
  return results;
};

/** 请求体校验：失败时直接回 400 并返回 null */
export const parseBody = <T>(schema: ZodType<T>, body: unknown, response: Response): T | null => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    response.status(400).json({
      error: '请求参数不合法',
      details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
    return null;
  }
  return parsed.data;
};
