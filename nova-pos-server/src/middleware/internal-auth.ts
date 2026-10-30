import { createHash, timingSafeEqual } from 'node:crypto';

import { NextFunction, Request, Response } from 'express';

import { getInternalToken } from '../config';
import { verifySessionToken, type SessionRole } from '../auth/jwt';

export type UserRole = SessionRole;

/** 导购员不可见的成本与毛利字段，响应返回前统一裁剪 */
const REDACTED_KEYS = new Set([
  'cost',
  'costPrice',
  'profit',
  'profitRate',
  'totalCost',
  'grossProfit',
  'grossProfitRate',
  'grossMarginRate',
]);

/** 仅管理员可访问的接口 */
const ADMIN_ONLY_PREFIXES = [
  '/order/queryOrderRate',
  '/data/archiveMonthData',
  '/marketing/create',
  '/marketing/update',
  '/marketing/delete',
  '/marketing/offline',
  '/user/update',
  '/user/list',
];

/**
 * 导购员可执行的写接口白名单。
 * 未列出的写接口默认拒绝，避免新增管理接口时忘记补黑名单导致越权。
 */
const CLERK_ALLOWED_WRITES = new Set([
  '/buy/submit',
  '/order/changeItem',
  '/order/refundItem',
  '/order/checkBill',
  '/order/modify',
  '/order/export',
  '/order/exportOrderItemList',
  '/order/updatePrintStatus',
  '/order/toggleShow',
  '/inventory/update',
  '/inventory/create',
  '/inventory/batchProcessPurchaseData',
  '/inventory/batchProcessReturnsData',
  '/inventory/batchCreate',
  '/inventory/batchReturns',
  '/inventory/template',
  '/member/create',
  '/member/update',
  '/member/updateScore',
  '/member/incomeBalance',
  '/member/submitUserDrawed',
  '/member/updateBalance',
  '/user/changePassword',
  '/data/getCoreData',
  '/common/uploadFile',
]);

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 仅当响应体出现这些键时才需要遍历裁剪 */
const SENSITIVE_KEY_PATTERN = /"(?:cost|costPrice|profit|profitRate|totalCost|grossProfit|grossProfitRate|grossMarginRate)"\s*:/;

/** 常量时间比较，避免逐字节比较泄漏令牌长度与前缀 */
const safeEqual = (actual: string, expected: string): boolean => {
  const left = createHash('sha256').update(actual).digest();
  const right = createHash('sha256').update(expected).digest();
  return timingSafeEqual(left, right);
};

/** Sequelize 模型实例必须先 toJSON 展开，直接取自有属性只会拿到 dataValues 等内部字段 */
const toPlainRecord = (value: object): Record<string, unknown> => {
  const candidate = value as { toJSON?: () => unknown };
  if (typeof candidate.toJSON !== 'function') return value as Record<string, unknown>;
  const plain = candidate.toJSON();
  return plain && typeof plain === 'object' && !Array.isArray(plain)
    ? (plain as Record<string, unknown>)
    : (value as Record<string, unknown>);
};

const stripSensitiveFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripSensitiveFields);
  if (!value || typeof value !== 'object') return value;

  if (value instanceof Date) return value;

  const record = toPlainRecord(value);
  const hasCost = 'cost' in record || 'totalCost' in record;

  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => {
        if (REDACTED_KEYS.has(key)) return false;
        // 图表里 rate 与 cost 成对出现，代表毛利率，导购员同样不可见
        if (hasCost && key === 'rate') return false;
        return true;
      })
      .map(([key, item]) => [key, stripSensitiveFields(item)]),
  );
};

/**
 * 内部令牌校验：只用于服务端之间换取 JWT（POST /auth/token）。
 * 令牌来自 ~/.nova/server-config.json，不再支持环回地址免鉴权。
 */
export const internalTokenAuth = (
  request: Request,
  response: Response,
  next: NextFunction,
): void => {
  let expected = '';

  try {
    // 配置读取带 TTL 与 mtime 缓存，桌面端改令牌后最多 5 秒生效
    expected = getInternalToken();
  } catch {
    response.status(500).json({ code: 500, message: 'Server config invalid' });
    return;
  }

  const provided = request.get('x-nova-token') ?? '';

  if (!expected || !provided || !safeEqual(provided, expected)) {
    response.status(401).json({ code: 401, message: 'Unauthorized' });
    return;
  }

  next();
};

/**
 * 业务鉴权：只接受 `Authorization: Bearer <JWT>`。
 * 角色与用户身份全部来自签名载荷，客户端无法通过请求头伪造。
 * 导购员（clerk）额外做写接口拦截与成本字段裁剪。
 */
export const internalAuth = (request: Request, response: Response, next: NextFunction): void => {
  const header = request.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const payload = match ? verifySessionToken(match[1]) : null;

  if (!payload) {
    response.status(401).json({ code: 401, message: 'Unauthorized' });
    return;
  }

  const role: UserRole = payload.role;

  // 下游控制器仍可通过 x-user-id 记录操作人，这里由签名载荷回填，忽略客户端传值
  request.headers['x-user-id'] = payload.sub;
  response.locals.userRole = role;
  response.locals.userId = payload.sub;
  response.locals.username = payload.username;

  if (role === 'clerk') {
    const isAdminOnly = ADMIN_ONLY_PREFIXES.some((prefix) => request.path.startsWith(prefix));
    const isWrite = !READ_METHODS.has(request.method.toUpperCase());
    const isAllowedWrite = CLERK_ALLOWED_WRITES.has(request.path);

    if (isAdminOnly || (isWrite && !isAllowedWrite)) {
      response.status(403).json({ code: 403, message: 'Forbidden' });
      return;
    }

    // 仅在响应体包含敏感字段时才做裁剪，避免每个响应都深拷贝
    const originalJson = response.json.bind(response);
    response.json = ((body: unknown) => {
      try {
        const serialized = JSON.stringify(body);
        if (!SENSITIVE_KEY_PATTERN.test(serialized)) {
          return originalJson(body);
        }
      } catch {
        // 序列化失败时交给原逻辑兜底
      }
      return originalJson(stripSensitiveFields(body));
    }) as Response['json'];
  }

  next();
};
