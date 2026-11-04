import dayjs from 'dayjs';
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';

import logger from '../logger';
import { Member } from '../model/member';
import { RedeemItem } from '../model/redeemItem';
import { RedeemOrder } from '../model/redeemOrder';
import { withTransaction } from '../utils/db';
import { findAllByInChunks, parseBody, resolvePagination } from '../utils/query';

/** 业务校验失败：带状态码抛出，控制器统一转成 4xx 响应 */
class RedeemError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

const redeemItemFields = z.object({
  name: z.string().trim().min(1, '请输入礼品名称').max(64, '礼品名称最多 64 个字符'),
  image: z.string().trim().max(255).optional().default(''),
  description: z.string().trim().max(255).optional().default(''),
  detail: z.string().trim().max(5000).optional().default(''),
  points: z.coerce.number().int().min(0, '所需积分不能为负').max(1_000_000),
  totalStock: z.coerce.number().int().min(0, '总库存不能为负').max(1_000_000),
  perMemberLimit: z.coerce.number().int().min(1, '每人限兑至少 1 件').max(999),
  status: z.enum(['active', 'inactive']).optional().default('active'),
  sort: z.coerce.number().int().min(0).max(100_000).optional().default(0),
});

const createRedeemItemSchema = redeemItemFields;

const updateRedeemItemSchema = redeemItemFields.extend({
  id: z.coerce.number().int().positive(),
});

const verifyRedeemOrderSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** 兑换礼品的进度：已兑数量 = 总库存 - 剩余库存，前端直接展示 */
const withProgress = (item: { toJSON: () => unknown }) => {
  const json = item.toJSON() as Record<string, unknown>;
  const totalStock = Number(json.totalStock ?? 0);
  const stock = Number(json.stock ?? 0);
  json.redeemedCount = Math.max(0, totalStock - stock);
  return json;
};

/** 礼品列表：关键字 / 状态筛选 + 分页，按展示顺序升序 */
export const getRedeemItems = async (req: Request, res: Response): Promise<void> => {
  const { keyword, status } = req.query as Record<string, unknown>;
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);
  const where: Record<string, unknown> = {};

  if (typeof keyword === 'string' && keyword.trim()) {
    where.name = { [Op.substring]: keyword.trim() };
  }
  if (status === 'active' || status === 'inactive') {
    where.status = status;
  }

  try {
    const { count, rows } = await RedeemItem.findAndCountAll({
      where,
      order: [
        ['sort', 'ASC'],
        ['id', 'DESC'],
      ],
      limit,
      offset,
    });
    res.json({ count, data: rows.map(withProgress) });
  } catch (error) {
    logger.error('Error getting redeem items:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/** 新增礼品：初始剩余库存等于总库存 */
export const createRedeemItem = async (req: Request, res: Response): Promise<void> => {
  const parsed = parseBody(createRedeemItemSchema, req.body, res);
  if (!parsed) return;

  try {
    const item = await RedeemItem.create({
      ...parsed,
      stock: parsed.totalStock,
    });
    res.json({ data: withProgress(item) });
  } catch (error) {
    logger.error('Error creating redeem item:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 修改礼品：总库存按差值同步剩余库存，保持「已兑数量」不变。
 * 总库存不能小于已兑数量，否则会出现负库存。
 */
export const updateRedeemItem = async (req: Request, res: Response): Promise<void> => {
  const parsed = parseBody(updateRedeemItemSchema, req.body, res);
  if (!parsed) return;

  try {
    const updated = await withTransaction(async (transaction) => {
      const item = await RedeemItem.findByPk(parsed.id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!item) return null;

      const oldTotal = Number(item.get('totalStock') ?? 0);
      const oldStock = Number(item.get('stock') ?? 0);
      const redeemed = Math.max(0, oldTotal - oldStock);
      const nextStock = parsed.totalStock - redeemed;

      if (nextStock < 0) {
        throw new RedeemError(400, `总库存不能小于已兑数量（${redeemed} 件）`);
      }

      await item.update(
        {
          name: parsed.name,
          image: parsed.image,
          description: parsed.description,
          detail: parsed.detail,
          points: parsed.points,
          totalStock: parsed.totalStock,
          stock: nextStock,
          perMemberLimit: parsed.perMemberLimit,
          status: parsed.status,
          sort: parsed.sort,
        },
        // 必须复用同一事务，否则另开连接更新已被 FOR UPDATE 锁定的行会死锁
        { transaction },
      );
      return item;
    });

    if (!updated) {
      res.status(404).json({ error: '礼品不存在' });
      return;
    }
    res.json({ data: withProgress(updated) });
  } catch (error) {
    if (error instanceof RedeemError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    logger.error('Error updating redeem item:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 礼品兑换记录：必须指定礼品；状态筛选按「当前有效状态」判定。
 * 过期未核销的 pending_pickup 记录在读取时懒判定为 expired（只改返回值，不改库）。
 */
export const getRedeemOrders = async (req: Request, res: Response): Promise<void> => {
  const { itemId, status } = req.query as Record<string, unknown>;
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: '缺少礼品 ID' });
    return;
  }

  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
  const where: Record<string | symbol, unknown> = { itemId: id };

  if (status === 'pending_pickup') {
    where.status = 'pending_pickup';
    where.expiredAt = { [Op.gt]: now };
  } else if (status === 'picked' || status === 'cancelled') {
    where.status = status;
  } else if (status === 'expired') {
    where[Op.or] = [
      { status: 'expired' },
      { status: 'pending_pickup', expiredAt: { [Op.lte]: now } },
    ];
  }

  try {
    const { count, rows } = await RedeemOrder.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const data = rows.map((row) => {
      const json = row.toJSON() as Record<string, unknown>;
      if (
        json.status === 'pending_pickup' &&
        dayjs(json.expiredAt as string).isBefore(dayjs())
      ) {
        json.status = 'expired';
      }
      return json;
    });

    // 兑换单只存手机号，批量补会员姓名，方便店员核对身份
    const phones = [...new Set(data.map((row) => String(row.phone ?? '')))]
      .filter(Boolean);
    const members = await findAllByInChunks(Member, 'phone', phones, {
      attributes: ['phone', 'name', 'level'],
    });
    const memberMap = new Map<string, string>();
    for (const member of members as Array<{ get: (key: string) => unknown }>) {
      memberMap.set(String(member.get('phone')), String(member.get('name') ?? ''));
    }
    for (const row of data) {
      row.memberName = memberMap.get(String(row.phone)) ?? '';
    }

    res.json({ count, data });
  } catch (error) {
    logger.error('Error getting redeem orders:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * 核销：仅「待取货且未过期」可核销。
 * 用条件更新保证并发下只有一次成功，避免同一张兑换单被重复核销。
 */
export const verifyRedeemOrder = async (req: Request, res: Response): Promise<void> => {
  const parsed = parseBody(verifyRedeemOrderSchema, req.body, res);
  if (!parsed) return;

  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  try {
    const [affected] = await RedeemOrder.update(
      { status: 'picked', pickedAt: new Date() },
      {
        where: {
          id: parsed.id,
          status: 'pending_pickup',
          expiredAt: { [Op.gt]: now },
        },
      },
    );

    if (!affected) {
      const existing = await RedeemOrder.findByPk(parsed.id);
      if (!existing) {
        res.status(404).json({ error: '兑换记录不存在' });
        return;
      }
      const current = String(existing.get('status') ?? '');
      const message =
        current === 'picked'
          ? '该兑换记录已核销'
          : current === 'pending_pickup'
            ? '该兑换记录已超过取货截止时间'
            : '该兑换记录当前状态不可核销';
      res.status(409).json({ error: message });
      return;
    }

    const updated = await RedeemOrder.findByPk(parsed.id);
    res.json({ data: updated });
  } catch (error) {
    logger.error('Error verifying redeem order:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
