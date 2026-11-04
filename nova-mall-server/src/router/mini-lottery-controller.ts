import type { Request, Response } from 'express';
import { z } from 'zod';
import { drawLottery, getLotteryConfig } from '../service/lottery';
import { handle } from '../utils/async-handler';
import { parseBody } from '../utils/query';

const drawSchema = z.object({
  requestId: z.string().min(1, 'requestId 不能为空').max(64, 'requestId 过长'),
});

/** 抽奖配置：消耗积分、每日上限、今日已抽次数、当前积分与展示奖品 */
export const getMiniLotteryConfig = handle(async (req: Request, res: Response) => {
  const config = await getLotteryConfig(req.member!.phone);
  res.json({ success: true, data: config });
});

/** 积分抽奖；requestId 保证客户端重试只生效一次 */
export const postMiniLotteryDraw = handle(async (req: Request, res: Response) => {
  const body = parseBody(drawSchema, req.body, res);
  if (!body) return;

  const result = await drawLottery(req.member!.phone, body.requestId);
  res.json({ success: true, data: result });
});
