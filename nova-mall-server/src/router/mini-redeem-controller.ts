import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/error';
import { listRedeemOrders, listRedeems, redeemItem } from '../service/redeem';
import { handle } from '../utils/async-handler';
import { parseBody, resolvePagination } from '../utils/query';

const redeemSchema = z.object({
  requestId: z.string().min(1, 'requestId 不能为空').max(64, 'requestId 过长'),
});

/** 积分兑换礼品列表（含剩余库存、每人剩余额度与当前是否可兑） */
export const getMiniRedeems = handle(async (req: Request, res: Response) => {
  const { data, points } = await listRedeems(req.member!.phone);
  res.json({ success: true, data, points });
});

/** 兑换礼品；错误码按方案 4.6：INSUFFICIENT_POINTS / OUT_OF_STOCK / REDEEM_LIMIT */
export const postMiniRedeem = handle(async (req: Request, res: Response) => {
  const itemId = Number(req.params.id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new AppError(400, 'INVALID_PARAMS', '礼品 id 不合法');
  }

  const body = parseBody(redeemSchema, req.body, res);
  if (!body) return;

  const result = await redeemItem(req.member!.phone, itemId, body.requestId);
  res.json({ success: true, data: result });
});

/** 我的兑换：支持 status 筛选，待取货单过期时查询期懒判定为 expired */
export const getMiniRedeemOrders = handle(async (req: Request, res: Response) => {
  const rawStatus = req.query.status;
  const status = typeof rawStatus === 'string' ? rawStatus : undefined;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);

  const { count, data } = await listRedeemOrders(req.member!.phone, status, { limit, offset });
  res.json({ success: true, data, count });
});
