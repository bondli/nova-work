import type { Request, Response } from 'express';
import { getSigninStatus, signIn } from '../service/signin';
import { handle } from '../utils/async-handler';

/** 签到状态：今日是否已签、连续天数、7 天奖励条与最近签到日期 */
export const getMiniSigninStatus = handle(async (req: Request, res: Response) => {
  const status = await getSigninStatus(req.member!.phone);
  res.json({ success: true, data: status });
});

/** 每日签到；重复签到按成功态返回 ALREADY_SIGNED（HTTP 200） */
export const postMiniSignin = handle(async (req: Request, res: Response) => {
  const result = await signIn(req.member!.phone);
  const data = {
    todaySigned: result.todaySigned,
    streakDays: result.streakDays,
    addedPoints: result.addedPoints,
    rewards: result.rewards,
    totalPoints: result.totalPoints,
  };

  if (result.already) {
    res.status(200).json({ success: true, code: 'ALREADY_SIGNED', data });
    return;
  }

  res.json({ success: true, data });
});
