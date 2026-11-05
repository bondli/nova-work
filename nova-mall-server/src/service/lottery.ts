import dayjs from 'dayjs';
import { Op, UniqueConstraintError } from 'sequelize';
import type { Model, Transaction } from 'sequelize';
import { getMiniConfig } from '../config';
import { AppError } from '../middleware/error';
import { LotteryPrize } from '../model/lotteryPrize';
import { Member } from '../model/member';
import { MemberDrawRecord } from '../model/memberDrawRecord';
import { Order } from '../model/order';
import { sequelize } from '../model/index';
import { issueCoupon } from './coupon';
import { changePoints } from './points';

const DRAW_INFO = '积分抽奖';

/** 新会员首抽保底券：满 100 减 5 元，30 天有效（不占奖池库存，也不走加权抽取） */
const NEW_MEMBER_COUPON = {
  condition: 100,
  value: 5,
  /** 与奖池 LotteryPrize.name 保持一致，客户端按奖品名定位转盘扇区 */
  name: '满 100 减 5 券',
  desc: '满 100 减 5 元券',
  validDays: 30,
} as const;

export interface LotteryCouponSnapshot {
  couponId: string;
  condition: number;
  value: number;
  desc: string;
  validDays: number;
}

export interface LotteryDrawResult {
  prize: string;
  prizeType: string;
  pointsAdded: number;
  coupon: LotteryCouponSnapshot | null;
  cost: number;
  totalPoints: number;
  todayCount: number;
  record: unknown;
}

interface DrawExtra {
  requestId?: string;
  cost?: number;
  prizeId?: number | null;
  prizeType?: string;
  pointsAdded?: number;
  coupon?: LotteryCouponSnapshot | null;
  /** 新会员首抽保底标记，便于排查与去重 */
  newMember?: boolean;
}

const safeParseExtra = (value: unknown): DrawExtra => {
  if (typeof value !== 'string' || !value) return {};
  try {
    return JSON.parse(value) as DrawExtra;
  } catch {
    return {};
  }
};

const todayRange = (): { start: Date; end: Date } => ({
  start: dayjs().startOf('day').toDate(),
  end: dayjs().endOf('day').toDate(),
});

const countTodayDraws = async (phone: string, transaction?: Transaction): Promise<number> => {
  const { start, end } = todayRange();
  return MemberDrawRecord.count({
    where: { phone, createdAt: { [Op.gte]: start, [Op.lte]: end } },
    transaction,
  });
};

/**
 * 新会员首抽判定：名下没有购物记录（orderType='normal'）即为新会员；
 * 且此前没有任何抽奖记录才算「首次抽奖」，避免无消费记录的老用户反复拿保底券。
 */
const isNewMemberFirstDraw = async (phone: string, transaction: Transaction): Promise<boolean> => {
  const [orderCount, drawCount] = await Promise.all([
    Order.count({ where: { userPhone: phone, orderType: 'normal' }, transaction }),
    MemberDrawRecord.count({ where: { phone }, transaction }),
  ]);
  return orderCount === 0 && drawCount === 0;
};

export const getLotteryConfig = async (phone: string) => {
  const config = getMiniConfig();
  const [member, prizes, todayCount] = await Promise.all([
    Member.findOne({ where: { phone }, attributes: ['point'] }),
    LotteryPrize.findAll({
      where: { status: 'active' },
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC'],
      ],
      attributes: ['id', 'name', 'prizeType', 'points', 'couponValue', 'couponCondition', 'sort'],
    }),
    countTodayDraws(phone),
  ]);

  return {
    cost: config.lottery.cost,
    dailyLimit: config.lottery.dailyLimit,
    todayCount,
    points: Number(member?.get('point') ?? 0),
    prizes: prizes.map((prize) => ({
      id: Number(prize.get('id')),
      name: prize.get('name') as string,
      prizeType: prize.get('prizeType') as string,
      points: Number(prize.get('points') ?? 0),
      couponValue: prize.get('couponValue') === null ? null : Number(prize.get('couponValue')),
      couponCondition:
        prize.get('couponCondition') === null ? null : Number(prize.get('couponCondition')),
    })),
  };
};

/** 客户端重试时按 requestId 返回原结果，不重复扣分 */
const replayDraw = async (record: Model): Promise<LotteryDrawResult> => {
  const extra = safeParseExtra(record.get('extra'));
  const phone = record.get('phone') as string;
  const [member, todayCount] = await Promise.all([
    Member.findOne({ where: { phone }, attributes: ['point'] }),
    countTodayDraws(phone),
  ]);

  return {
    prize: (record.get('award') as string) ?? '谢谢参与',
    prizeType: extra.prizeType ?? 'none',
    pointsAdded: Number(extra.pointsAdded ?? 0),
    coupon: extra.coupon ?? null,
    cost: Number(extra.cost ?? getMiniConfig().lottery.cost),
    totalPoints: Number(member?.get('point') ?? 0),
    todayCount,
    record: record.toJSON(),
  };
};

/** 中奖率保底：谢谢参与占比不超过 30%，避免中奖率过低 */
const MIN_WIN_RATE = 0.7;
/** 积分奖品期望返还上限：单次消耗积分的 80%，保证长期只消耗积分 */
const MAX_POINTS_PAYOUT_RATIO = 0.8;
/** 优惠券总中奖率上限，避免券成本失控 */
const MAX_COUPON_RATE = 0.1;

/**
 * 计算最终抽取权重（总和为 1）：
 * 1. 全量奖池中奖率固定不低于 70%；
 * 2. 优惠券按 DB 相对权重分配，总占比不超过 10%；
 * 3. 积分奖品按 DB 相对权重分配，但期望返还压到单次成本 80% 以内：
 *    超出预算时等比压缩高积分奖品，缺口由最低积分奖品承接，
 *    既保证不亏本，也保留大额奖品的中奖可能。
 */
const resolveWeights = (prizes: Model[], cost: number): number[] => {
  const weights = prizes.map(() => 0);
  const noneIndexes: number[] = [];
  const pointsIndexes: number[] = [];
  const couponIndexes: number[] = [];

  prizes.forEach((prize, index) => {
    const type = prize.get('prizeType') as string;
    if (type === 'points' && Number(prize.get('points') ?? 0) > 0) pointsIndexes.push(index);
    else if (type === 'coupon') couponIndexes.push(index);
    else noneIndexes.push(index);
  });

  // 奖池没有任何可中奖项时，全部落在未中奖项
  if (pointsIndexes.length === 0 && couponIndexes.length === 0) {
    noneIndexes.forEach((index) => {
      weights[index] = 1 / noneIndexes.length;
    });
    return weights;
  }

  const noneShare = 1 - MIN_WIN_RATE;
  const couponShare =
    couponIndexes.length === 0 ? 0 : pointsIndexes.length === 0 ? MIN_WIN_RATE : MAX_COUPON_RATE;
  const pointsShare = Math.max(0, MIN_WIN_RATE - couponShare);

  const distribute = (indexes: number[], share: number) => {
    const totalBase = indexes.reduce((sum, index) => sum + Math.max(0, Number(prizes[index]?.get('weight') ?? 0)), 0);
    indexes.forEach((index) => {
      const base = Math.max(0, Number(prizes[index]?.get('weight') ?? 0));
      weights[index] = totalBase > 0 ? (share * base) / totalBase : share / indexes.length;
    });
  };

  distribute(noneIndexes, noneShare);
  distribute(couponIndexes, couponShare);

  if (pointsIndexes.length > 0 && pointsShare > 0) {
    distribute(pointsIndexes, pointsShare);

    const values = pointsIndexes.map((index) => Number(prizes[index]?.get('points') ?? 0));
    const expectedPayout = pointsIndexes.reduce(
      (sum, index, position) => sum + weights[index]! * (values[position] ?? 0),
      0,
    );
    const maxPayout = cost * MAX_POINTS_PAYOUT_RATIO;

    if (expectedPayout > maxPayout) {
      const cheapest = values.indexOf(Math.min(...values));
      const cheapestValue = values[cheapest] ?? 0;
      const expensiveGap = pointsIndexes.reduce((sum, index, position) => {
        if (position === cheapest) return sum;
        return sum + weights[index]! * ((values[position] ?? 0) - cheapestValue);
      }, 0);

      // 把超出预算的部分压缩到高积分奖品，剩余概率全部给最低积分奖品
      const factor = expensiveGap > 0 ? (maxPayout - pointsShare * cheapestValue) / expensiveGap : 0;
      if (factor > 0) {
        let expensiveTotal = 0;
        pointsIndexes.forEach((index, position) => {
          if (position === cheapest) return;
          const next = weights[index]! * Math.min(1, factor);
          weights[index] = next;
          expensiveTotal += next;
        });
        const cheapestIndex = pointsIndexes[cheapest]!;
        weights[cheapestIndex] = pointsShare - expensiveTotal;
      } else {
        // 连最低积分奖品都超出预算：按预算限制最低奖品的中奖率，其余转给未中奖/优惠券
        const affordable = cheapestValue > 0 ? maxPayout / cheapestValue : 0;
        weights[pointsIndexes[cheapest]!] = affordable;
        pointsIndexes.forEach((index, position) => {
          if (position !== cheapest) weights[index] = 0;
        });
        const remaining = Math.max(0, 1 - couponShare - affordable);
        if (noneIndexes.length > 0) distribute(noneIndexes, remaining);
        else distribute(couponIndexes, couponShare + remaining);
      }
    }
  }

  return weights;
};

/** 按给定权重加权抽取；权重总和为 0 视为奖池异常 */
const pickPrize = (prizes: Model[], weights: number[]): Model | null => {
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  if (prizes.length === 0 || totalWeight <= 0) return null;

  let hit = Math.random() * totalWeight;
  for (let index = 0; index < prizes.length; index += 1) {
    hit -= Math.max(0, weights[index] ?? 0);
    if (hit < 0) return prizes[index] ?? null;
  }
  return prizes[prizes.length - 1] ?? null;
};

/**
 * 积分抽奖：锁会员行 → 校验积分与当日次数 → 扣分 → 加权抽奖 → 发奖 → 写记录。
 * requestId 唯一索引保证重试幂等，库存为 NULL 表示不限。
 */
export const drawLottery = async (phone: string, requestId: string): Promise<LotteryDrawResult> => {
  const { cost, dailyLimit } = getMiniConfig().lottery;

  const existing = await MemberDrawRecord.findOne({ where: { phone, requestId } });
  if (existing) return replayDraw(existing);

  try {
    return await sequelize.transaction(async (transaction) => {
      const duplicated = await MemberDrawRecord.findOne({ where: { phone, requestId }, transaction });
      if (duplicated) return replayDraw(duplicated);

      const member = await Member.findOne({
        where: { phone },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!member) {
        throw new AppError(404, 'MEMBER_NOT_FOUND', '会员不存在');
      }

      const points = Number(member.get('point') ?? 0);
      if (points < cost) {
        throw new AppError(400, 'POINTS_NOT_ENOUGH', '积分不足，无法抽奖');
      }

      const todayCount = await countTodayDraws(phone, transaction);
      if (todayCount >= dailyLimit) {
        throw new AppError(429, 'DAILY_LIMIT', '今日抽奖次数已用完');
      }

      const prizes = await LotteryPrize.findAll({
        where: {
          status: 'active',
          [Op.or]: [{ stock: null }, { stock: { [Op.gt]: 0 } }],
        },
        order: [
          ['sort', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      // 新会员首抽保底：跳过加权抽取，直接发满 100 减 5 券（其余会员抽奖逻辑不变）
      const newMemberFirstDraw = await isNewMemberFirstDraw(phone, transaction);

      let prize = newMemberFirstDraw ? null : pickPrize(prizes, resolveWeights(prizes, cost));
      if (prize) {
        const stock = prize.get('stock') as number | null;
        if (stock !== null) {
          // 条件扣库存，影响行数为 0 说明刚被抢光，本次按未中奖处理
          const [, affected] = await LotteryPrize.decrement('stock', {
            by: 1,
            where: { id: prize.get('id'), stock: { [Op.gt]: 0 } },
            transaction,
          });
          if (!affected) prize = null;
        }
      }

      await changePoints(phone, -cost, 'draw', '积分抽奖', { requestId }, transaction);

      const prizeType = newMemberFirstDraw ? 'coupon' : prize ? (prize.get('prizeType') as string) : 'none';
      const prizeName = newMemberFirstDraw
        ? NEW_MEMBER_COUPON.name
        : prize
          ? (prize.get('name') as string)
          : '谢谢参与';
      let pointsAdded = 0;
      let coupon: LotteryCouponSnapshot | null = null;

      if (newMemberFirstDraw) {
        const issued = await issueCoupon(
          phone,
          {
            condition: NEW_MEMBER_COUPON.condition,
            value: NEW_MEMBER_COUPON.value,
            desc: NEW_MEMBER_COUPON.desc,
            validDays: NEW_MEMBER_COUPON.validDays,
            extra: { requestId, newMember: true },
          },
          transaction,
        );
        coupon = {
          couponId: issued.get('couponId') as string,
          condition: Number(issued.get('couponCondition') ?? 0),
          value: Number(issued.get('couponValue') ?? 0),
          desc: (issued.get('couponDesc') as string) ?? NEW_MEMBER_COUPON.desc,
          validDays: NEW_MEMBER_COUPON.validDays,
        };
      } else if (prize && prizeType === 'points') {
        pointsAdded = Number(prize.get('points') ?? 0);
        if (pointsAdded > 0) {
          await changePoints(
            phone,
            pointsAdded,
            'draw_award',
            '抽奖中奖',
            { requestId, prizeId: prize.get('id') },
            transaction,
          );
        }
      } else if (prize && prizeType === 'coupon') {
        const validDays = Number(prize.get('couponValidDays') ?? 30);
        const issued = await issueCoupon(
          phone,
          {
            condition: prize.get('couponCondition') === null ? null : Number(prize.get('couponCondition')),
            value: Number(prize.get('couponValue') ?? 0),
            desc: (prize.get('couponDesc') as string) ?? prizeName,
            validDays,
            extra: { requestId, prizeId: prize.get('id') },
          },
          transaction,
        );
        coupon = {
          couponId: issued.get('couponId') as string,
          condition: Number(issued.get('couponCondition') ?? 0),
          value: Number(issued.get('couponValue') ?? 0),
          desc: (issued.get('couponDesc') as string) ?? prizeName,
          validDays,
        };
      }

      const extra: DrawExtra = {
        requestId,
        cost,
        prizeId: prize ? (prize.get('id') as number) : null,
        prizeType,
        pointsAdded,
        coupon,
        ...(newMemberFirstDraw ? { newMember: true } : {}),
      };

      const record = await MemberDrawRecord.create(
        {
          phone,
          info: DRAW_INFO,
          award: prizeName,
          extra: JSON.stringify(extra),
          requestId,
        },
        { transaction },
      );

      const latestMember = await Member.findOne({
        where: { phone },
        attributes: ['point'],
        transaction,
      });

      return {
        prize: prizeName,
        prizeType,
        pointsAdded,
        coupon,
        cost,
        totalPoints: Number(latestMember?.get('point') ?? 0),
        todayCount: todayCount + 1,
        record: record.toJSON(),
      };
    });
  } catch (error) {
    // 并发重试触发 requestId 唯一冲突：返回第一次的结果
    if (error instanceof UniqueConstraintError) {
      const record = await MemberDrawRecord.findOne({ where: { phone, requestId } });
      if (record) return replayDraw(record);
    }
    throw error;
  }
};
