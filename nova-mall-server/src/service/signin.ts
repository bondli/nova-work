import dayjs from 'dayjs';
import { Op, UniqueConstraintError } from 'sequelize';
import { getMiniConfig } from '../config';
import { Member } from '../model/member';
import { MemberSignIn } from '../model/memberSignIn';
import { sequelize } from '../model/index';
import { changePoints } from './points';

export interface SigninReward {
  day: number;
  points: number;
  signed: boolean;
  today: boolean;
}

export interface SigninStatus {
  todaySigned: boolean;
  streakDays: number;
  totalPoints: number;
  rewards: SigninReward[];
  signedDates: string[];
}

export interface SigninResult extends SigninStatus {
  addedPoints: number;
  /** 重复签到（已签到）时为 true */
  already: boolean;
}

const DATE_FORMAT = 'YYYY-MM-DD';

const toDateString = (value: unknown): string => dayjs(value as string).format(DATE_FORMAT);

/** 取最近 30 天的签到日期，用于计算连续天数与日历展示 */
const loadRecentDates = async (phone: string): Promise<string[]> => {
  const since = dayjs().subtract(30, 'day').format(DATE_FORMAT);
  const rows = await MemberSignIn.findAll({
    where: { phone, signDate: { [Op.gte]: since } },
    order: [['signDate', 'DESC']],
    attributes: ['signDate'],
  });
  return rows.map((row) => toDateString(row.get('signDate')));
};

/** 连续天数：今日已签则从今日往前数；未签则从昨日往前数（昨日断签即为 0） */
const calcStreak = (dates: Set<string>, todaySigned: boolean): number => {
  let cursor = todaySigned ? dayjs() : dayjs().subtract(1, 'day');
  let streak = 0;
  while (dates.has(cursor.format(DATE_FORMAT))) {
    streak += 1;
    cursor = cursor.subtract(1, 'day');
  }
  return streak;
};

/** 7 天奖励条：已签 / 今日 / 未来；连续满 7 天后进入下一轮 */
export const buildRewards = (streakDays: number, todaySigned: boolean): SigninReward[] => {
  const rewards = getMiniConfig().signin.rewards;
  const cyclePosition = streakDays > 0 ? ((streakDays - 1) % rewards.length) + 1 : 0;
  const nextDay = cyclePosition >= rewards.length ? 1 : cyclePosition + 1;
  const todaySlot = todaySigned ? cyclePosition : nextDay;

  return rewards.map((points, index) => {
    const day = index + 1;
    return {
      day,
      points,
      signed: day <= cyclePosition,
      today: day === todaySlot,
    };
  });
};

export const getSigninStatus = async (phone: string): Promise<SigninStatus> => {
  const [member, dates] = await Promise.all([
    Member.findOne({ where: { phone }, attributes: ['point'] }),
    loadRecentDates(phone),
  ]);

  const today = dayjs().format(DATE_FORMAT);
  const todaySigned = dates.includes(today);
  const streakDays = calcStreak(new Set(dates), todaySigned);

  return {
    todaySigned,
    streakDays,
    totalPoints: Number(member?.get('point') ?? 0),
    rewards: buildRewards(streakDays, todaySigned),
    signedDates: dates,
  };
};

/**
 * 每日签到：唯一索引 (phone, signDate) 兜底，重复签到按成功态（ALREADY_SIGNED）返回；
 * 断签（昨日无记录）连续天数重置为 1，签到与积分流水在同一事务内完成。
 */
export const signIn = async (phone: string): Promise<SigninResult> => {
  const today = dayjs().format(DATE_FORMAT);

  try {
    const outcome = await sequelize.transaction(async (transaction) => {
      const existing = await MemberSignIn.findOne({ where: { phone, signDate: today }, transaction });
      if (existing) {
        return { already: true as const };
      }

      const yesterday = dayjs().subtract(1, 'day').format(DATE_FORMAT);
      const yesterdayRecord = await MemberSignIn.findOne({
        where: { phone, signDate: yesterday },
        transaction,
      });

      const streakDays = yesterdayRecord ? Number(yesterdayRecord.get('streakDays') ?? 0) + 1 : 1;
      const rewards = getMiniConfig().signin.rewards;
      const points = rewards[(streakDays - 1) % rewards.length] ?? rewards[0] ?? 0;

      await MemberSignIn.create({ phone, signDate: today, points, streakDays }, { transaction });
      const { point } = await changePoints(
        phone,
        points,
        'signin',
        '每日签到',
        { signDate: today, streakDays },
        transaction,
      );

      return { already: false as const, streakDays, addedPoints: points, totalPoints: point };
    });

    if (outcome.already) {
      const status = await getSigninStatus(phone);
      return { ...status, addedPoints: 0, already: true };
    }

    return {
      todaySigned: true,
      streakDays: outcome.streakDays,
      totalPoints: outcome.totalPoints,
      rewards: buildRewards(outcome.streakDays, true),
      signedDates: (await loadRecentDates(phone)) ?? [],
      addedPoints: outcome.addedPoints,
      already: false,
    };
  } catch (error) {
    // 并发重复提交会触发唯一索引冲突，视为已签到而非错误
    if (error instanceof UniqueConstraintError) {
      const status = await getSigninStatus(phone);
      return { ...status, addedPoints: 0, already: true };
    }
    throw error;
  }
};
