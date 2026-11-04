import dayjs from 'dayjs';
import { Op, UniqueConstraintError } from 'sequelize';
import type { Model } from 'sequelize';
import { getMiniConfig } from '../config';
import { AppError } from '../middleware/error';
import { Member } from '../model/member';
import { RedeemItem } from '../model/redeemItem';
import { RedeemOrder } from '../model/redeemOrder';
import { sequelize } from '../model/index';
import { changePoints } from './points';

/** 计入每人限兑的单状态：已取消 / 已过期不占用额度 */
const OCCUPIED_STATUS = ['pending_pickup', 'picked'];

export interface RedeemResult {
  order: unknown;
  remainStock: number;
  points: number;
}

/** 客户端重试时按 requestId 返回原兑换单，不重复扣分与扣库存 */
const replayOrder = async (order: Model): Promise<RedeemResult> => {
  const phone = order.get('phone') as string;
  const itemId = Number(order.get('itemId'));
  const [item, member] = await Promise.all([
    RedeemItem.findByPk(itemId),
    Member.findOne({ where: { phone }, attributes: ['point'] }),
  ]);
  return {
    order: order.toJSON(),
    remainStock: Number(item?.get('stock') ?? 0),
    points: Number(member?.get('point') ?? 0),
  };
};

/** 礼品列表：附带剩余库存、每人剩余可兑数量与当前是否可兑 */
export const listRedeems = async (phone: string) => {
  const [member, items] = await Promise.all([
    Member.findOne({ where: { phone }, attributes: ['point'] }),
    RedeemItem.findAll({
      where: { status: 'active' },
      order: [
        ['sort', 'ASC'],
        ['id', 'ASC'],
      ],
    }),
  ]);

  const points = Number(member?.get('point') ?? 0);
  const itemIds = items.map((item) => Number(item.get('id')));
  const redeemedMap = new Map<number, number>();

  if (itemIds.length > 0) {
    const records = await RedeemOrder.findAll({
      where: { phone, itemId: { [Op.in]: itemIds }, status: { [Op.in]: OCCUPIED_STATUS } },
      attributes: ['itemId'],
    });
    for (const record of records) {
      const id = Number(record.get('itemId'));
      redeemedMap.set(id, (redeemedMap.get(id) ?? 0) + 1);
    }
  }

  const data = items.map((item) => {
    const id = Number(item.get('id'));
    const stock = Number(item.get('stock') ?? 0);
    const required = Number(item.get('points') ?? 0);
    const perMemberLimit = Number(item.get('perMemberLimit') ?? 1);
    const redeemedCount = redeemedMap.get(id) ?? 0;
    const perMemberLeft = Math.max(0, perMemberLimit - redeemedCount);

    return {
      ...(item.toJSON() as Record<string, unknown>),
      remainStock: stock,
      canRedeem: stock > 0 && perMemberLeft > 0 && points >= required,
      perMemberLeft,
      redeemedCount,
    };
  });

  return { data, points };
};

/**
 * 积分兑换：事务内先锁会员、再锁礼品（固定顺序避免死锁）→ 校验积分 / 上架 / 库存 / 限兑
 * → 扣分 → 条件扣库存 → 生成 6 位取货码与兑换单号 → 写兑换单。
 */
export const redeemItem = async (
  phone: string,
  itemId: number,
  requestId: string,
): Promise<RedeemResult> => {
  const existing = await RedeemOrder.findOne({ where: { phone, requestId } });
  if (existing) return replayOrder(existing);

  const { pickupValidDays } = getMiniConfig().redeem;
  const expiredAt = dayjs().add(pickupValidDays, 'day').format('YYYY-MM-DD HH:mm:ss');
  const datePart = dayjs().format('YYYYMMDD');

  try {
    return await sequelize.transaction(async (transaction) => {
      // 锁顺序固定：先会员、后礼品；锁住会员后再查幂等记录，保证同一会员的并发请求串行
      const member = await Member.findOne({
        where: { phone },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', '会员不存在');

      const duplicated = await RedeemOrder.findOne({ where: { phone, requestId }, transaction });
      if (duplicated) return replayOrder(duplicated);

      const item = await RedeemItem.findOne({
        where: { id: itemId, status: 'active' },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item) throw new AppError(404, 'REDEEM_ITEM_NOT_FOUND', '礼品不存在或已下架');

      const points = Number(member.get('point') ?? 0);
      const required = Number(item.get('points') ?? 0);
      const stock = Number(item.get('stock') ?? 0);
      const perMemberLimit = Number(item.get('perMemberLimit') ?? 1);

      if (stock <= 0) throw new AppError(409, 'OUT_OF_STOCK', '该礼品已兑完');

      const redeemedCount = await RedeemOrder.count({
        where: { phone, itemId, status: { [Op.in]: OCCUPIED_STATUS } },
        transaction,
      });
      if (redeemedCount >= perMemberLimit) {
        throw new AppError(409, 'REDEEM_LIMIT', '已达到该礼品每人限兑数量');
      }
      if (points < required) {
        throw new AppError(400, 'INSUFFICIENT_POINTS', '积分不足，无法兑换该礼品');
      }

      // 条件更新库存，影响行数为 0 说明已被并发抢光（Sequelize increment/decrement 返回 [affectedRows]）
      const [affected] = await RedeemItem.decrement('stock', {
        by: 1,
        where: { id: itemId, stock: { [Op.gt]: 0 } },
        transaction,
      });
      if (!affected) throw new AppError(409, 'OUT_OF_STOCK', '该礼品已兑完');

      await changePoints(
        phone,
        -required,
        'redeem',
        '积分兑换',
        { itemId, requestId },
        transaction,
      );

      const pickupCode = String(Math.floor(100000 + Math.random() * 900000));

      let order: Model | null = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const orderNo = `RD${datePart}${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
        try {
          order = await RedeemOrder.create(
            {
              orderNo,
              phone,
              itemId,
              itemName: item.get('name'),
              itemImage: item.get('image') ?? '',
              points: required,
              status: 'pending_pickup',
              pickupCode,
              expiredAt,
              requestId,
            },
            { transaction },
          );
          break;
        } catch (error) {
          if (!(error instanceof UniqueConstraintError)) throw error;
          const retried = await RedeemOrder.findOne({ where: { phone, requestId }, transaction });
          // 命中幂等冲突必须抛出以回滚本次事务（可能已扣分扣库存），交由外层返回原兑换单
          if (retried) throw error;
          // 否则是兑换单号重复，换一个单号继续重试
        }
      }

      if (!order) throw new AppError(500, 'ORDER_NO_CONFLICT', '兑换单号生成失败，请重试');

      const latest = await Member.findOne({ where: { phone }, attributes: ['point'], transaction });
      return {
        order: order.toJSON(),
        remainStock: stock - 1,
        points: Number(latest?.get('point') ?? 0),
      };
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      const record = await RedeemOrder.findOne({ where: { phone, requestId } });
      if (record) return replayOrder(record);
    }
    throw error;
  }
};

/** 兑换记录：查询时把已过期的待取货单懒判定为 expired（只改返回值，不改库） */
export const listRedeemOrders = async (
  phone: string,
  status: string | undefined,
  pagination: { limit: number; offset: number },
) => {
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  const where =
    status === 'pending_pickup'
      ? { phone, status: 'pending_pickup', expiredAt: { [Op.gt]: now } }
      : status === 'picked'
        ? { phone, status: 'picked' }
        : status === 'cancelled'
          ? { phone, status: 'cancelled' }
          : status === 'expired'
            ? {
                phone,
                [Op.or]: [
                  { status: 'expired' },
                  { status: 'pending_pickup', expiredAt: { [Op.lte]: now } },
                ],
              }
            : { phone };

  const { count, rows } = await RedeemOrder.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit: pagination.limit,
    offset: pagination.offset,
  });

  const data = rows.map((row) => {
    const json = row.toJSON() as Record<string, unknown>;
    if (
      json.status === 'pending_pickup' &&
      typeof json.expiredAt !== 'undefined' &&
      dayjs(json.expiredAt as string).isBefore(dayjs())
    ) {
      json.status = 'expired';
    }
    return json;
  });

  return { count, data };
};
