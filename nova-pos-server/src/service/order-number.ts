import dayjs from 'dayjs';
import { Op } from 'sequelize';
import type { Transaction } from 'sequelize';

import { isUniqueConstraintError } from '../utils/db';
import { Order } from '../model/order';

const MAX_ATTEMPTS = 5;

/**
 * 生成当天流水订单号并写库。
 * 订单号沿用 `YYYYMMDD + 三位流水`：并发下可能撞号，依赖 orderSn 唯一索引重试，
 * 避免两个收银台同时下单生成同一个订单号。
 */
export const createOrderWithGeneratedSn = async (
  values: Record<string, unknown>,
  options: { transaction: Transaction; createdAt?: Date | string }
) => {
  const baseDate = options.createdAt ? dayjs(options.createdAt) : dayjs();
  const dayStart = baseDate.startOf('day').toDate();
  const dayEnd = baseDate.endOf('day').toDate();
  const datePrefix = baseDate.format('YYYYMMDD');

  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const sameDayCount = await Order.count({
      where: { createdAt: { [Op.gte]: dayStart, [Op.lte]: dayEnd } },
      transaction: options.transaction,
    });
    const orderSn = `${datePrefix}${String(sameDayCount + 1 + attempt).padStart(3, '0')}`;

    try {
      return await Order.create(
        {
          ...values,
          orderSn,
          ...(options.createdAt ? { createdAt: options.createdAt } : {}),
        },
        { transaction: options.transaction },
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error('生成订单号失败，请重试');
};
