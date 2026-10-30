import { Request, Response } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import Decimal from 'decimal.js';
// import weixinService from '../service/weixin';

import logger from '../logger';

import { Order } from '../model/order';
import { OrderItems } from '../model/orderItems';
import { Member } from '../model/member';
import { Inventory } from '../model/inventory';
import { MemberScore } from '../model/memberScore';
import { MemberBalance } from '../model/memberBalance';
import { StoreCoupon } from '../model/storeCoupon';
import { MemberCoupon } from '../model/memberCoupon';
import { OrderCoupons } from '../model/orderCoupons';
import { Marketing } from '../model/marketing';
import { InventoryRecord } from '../model/inventoryRecord';
import { buildOrderItemsForCreate } from '../service/orderPricing';
import { createOrderWithGeneratedSn } from '../service/order-number';
import { withTransaction } from '../utils/db';

const submitOrderSchema = z.object({
  buyer: z
    .object({
      phone: z.string().trim().optional(),
      usePoint: z.coerce.number().finite().min(0).optional().default(0),
      useBalance: z.coerce.number().finite().min(0).optional().default(0),
      useCoupon: z.coerce.number().finite().min(0).optional().default(0),
      useCouponId: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
    })
    .optional(),
  storeSaler: z
    .object({
      id: z.coerce.number().int().optional().default(0),
      name: z.string().optional().default(''),
    })
    .optional(),
  waitSales: z.object({
    brief: z
      .object({
        counts: z.coerce.number().int().min(0).optional().default(0),
        totalAmount: z.coerce.number().finite().optional().default(0),
        payAmount: z.coerce.number().finite().optional().default(0),
        actualAmount: z.coerce.number().finite().optional().default(0),
        payType: z.string().optional().default('other'),
        remark: z.string().optional().default(''),
      })
      .optional(),
    list: z
      .array(
        z.object({
          sn: z.string().optional().default(''),
          sku: z.string().min(1),
          name: z.string().optional().default(''),
          brand: z.string().optional(),
          color: z.string().optional().default(''),
          size: z.string().optional().default(''),
          originalPrice: z.coerce.number().finite().optional().default(0),
          counts: z.coerce.number().int().positive(),
          actualPrice: z.coerce.number().finite().optional(),
          isGived: z.coerce.boolean().optional().default(false),
        }),
      )
      .min(1),
  }),
  storeCoupons: z
    .array(
      z.object({
        id: z.coerce.number().int(),
        couponValue: z.coerce.number().finite().min(0),
        couponDesc: z.string().optional().default(''),
      }),
    )
    .optional(),
});

// 创建订单
export const submitOrder = async (req: Request, res: Response) => {
  const parsed = submitOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: '订单参数不合法',
      details: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
    return;
  }

  const buyer = parsed.data.buyer ?? {};
  const storeSaler = parsed.data.storeSaler ?? {};
  const waitSales = parsed.data.waitSales;
  const brief = waitSales.brief ?? {};
  const storeCoupons = parsed.data.storeCoupons ?? [];
  const {
    counts,
    totalAmount: diaopaijia = 0,
    actualAmount = 0,
    payType = 'other',
    remark = '',
  } = brief;
  const itemList = waitSales.list;

  try {
    const orderData = await withTransaction(async (transaction) => {
      const useStoreCouponAmount = storeCoupons.reduce(
        (acc, coupon) => new Decimal(acc).plus(coupon.couponValue).toNumber(),
        0,
      );
      const useUserCouponAmount = buyer.useCoupon ?? 0;

      // 1.写入订单表（事务内生成订单号，唯一冲突时重试）
      const order = await createOrderWithGeneratedSn(
        {
          orderStatus: 'uncheck',
          orderItems: counts ?? 0,
          originalAmount: diaopaijia,
          orderAmount: brief.payAmount ?? 0,
          orderActualAmount: actualAmount,
          payType,
          userPhone: buyer.phone || '',
          usePoint: buyer.usePoint ?? 0,
          useBalance: buyer.useBalance ?? 0,
          useCoupon: useStoreCouponAmount + useUserCouponAmount,
          salerId: storeSaler.id ?? 0,
          salerName: storeSaler.name ?? '',
          remark,
          // 获取当前机器的操作系统，如果是 mac 系统，则 source 为 outlet，否则为 inshop
          source: process.platform === 'darwin' ? 'outlet' : 'inshop',
          // 将当前订单的信息全部写入 extra 字段，便于导入导出
          extra: JSON.stringify({
            buyer,
            storeSaler,
            waitSales,
            storeCoupons,
          }),
        },
        { transaction },
      );

      const orderJson = order.toJSON();
      if (!orderJson.orderSn) {
        throw new Error('Failed to create order: Invalid order data');
      }

      // 2.写入订单商品表
      const orderItems = buildOrderItemsForCreate({
        orderSn: orderJson.orderSn,
        items: itemList,
        orderActualAmount: actualAmount,
        useBalance: buyer.useBalance ?? 0,
      });

      await OrderItems.bulkCreate(orderItems, { transaction });

      // 3.扣减 SKU 对应的库存：一次性查出全部 SKU，避免逐条查询
      const skus = [...new Set(itemList.map((item) => item.sku))];
      const inventories = await Inventory.findAll({
        where: { sku: { [Op.in]: skus } },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const inventoryMap = new Map(inventories.map((item) => [String(item.get('sku')), item]));

      for (const item of itemList) {
        const inventory = inventoryMap.get(item.sku);
        if (!inventory) {
          throw new Error(`Inventory not found for SKU: ${item.sku}`);
        }

        const currentCounts = Number(inventory.get('counts') ?? 0);
        if (currentCounts < item.counts) {
          // 门店可能实物有货但库存数据不准，不阻断下单，只记录异常便于后续盘点
          logger.error(`Insufficient inventory for SKU: ${item.sku}`);
        }

        // 扣减库存的同时增加销量；允许负库存，便于后续追踪
        await inventory.update(
          {
            counts: currentCounts - item.counts,
            saleCounts: Number(inventory.get('saleCounts') ?? 0) + item.counts,
          },
          { transaction },
        );

        // 记录流水
        await InventoryRecord.create(
          {
            sku: item.sku,
            type: 'sale',
            info: `订单[${orderJson.orderSn}]销售`,
            count: item.counts,
          },
          { transaction },
        );
      }

      // 4.更新用户信息（消费金额更新，积分更新，余额更新）：使用自增/自减保证并发安全
      if (buyer.phone) {
        const member = await Member.findOne({
          where: { phone: buyer.phone },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!member) {
          throw new Error(`Member not found for phone: ${buyer.phone}`);
        }

        const earnedPoints = actualAmount > 0 ? Math.floor(actualAmount) : 0;
        await member.increment(
          {
            actual: new Decimal(actualAmount).toDecimalPlaces(2).toNumber(),
            point: earnedPoints - (buyer.usePoint ?? 0),
            balance: -new Decimal(buyer.useBalance ?? 0).toDecimalPlaces(2).toNumber(),
          },
          { transaction },
        );

        // 5.写入用户积分流水表
        const pointRecords: Array<{
          phone: string;
          point: number;
          type: string;
          reason: string;
        }> = [];

        if (earnedPoints > 0) {
          pointRecords.push({
            phone: buyer.phone,
            point: earnedPoints,
            type: 'earn',
            reason: `订单 ${orderJson.orderSn} 获取积分`,
          });
        }

        if ((buyer.usePoint ?? 0) > 0) {
          pointRecords.push({
            phone: buyer.phone,
            point: -(buyer.usePoint ?? 0),
            type: 'use',
            reason: `订单 ${orderJson.orderSn} 使用积分`,
          });
        }

        if (pointRecords.length > 0) {
          await MemberScore.bulkCreate(pointRecords, { transaction });
        }

        // 6.如果有使用余额，记录余额使用
        if ((buyer.useBalance ?? 0) > 0) {
          await MemberBalance.bulkCreate(
            [
              {
                phone: buyer.phone,
                value: -(buyer.useBalance ?? 0),
                type: 'use',
                reason: `订单 ${orderJson.orderSn} 使用余额`,
              },
            ],
            { transaction },
          );
        }

        // 7.如果用户有使用券，记录券使用
        if ((buyer.useCoupon ?? 0) > 0 && buyer.useCouponId) {
          const memberCoupon = await MemberCoupon.findOne({
            where: { id: buyer.useCouponId },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });

          if (!memberCoupon) {
            throw new Error(`Member coupon not found for id: ${buyer.useCouponId}`);
          }

          const memberCouponData = memberCoupon.toJSON();

          await MemberCoupon.update(
            { couponStatus: 'used' },
            { where: { id: buyer.useCouponId }, transaction },
          );
          await Member.increment({ coupon: -1 }, { where: { phone: buyer.phone }, transaction });
          await OrderCoupons.create(
            {
              orderSn: orderJson.orderSn,
              couponId: buyer.useCouponId,
              usedValue: buyer.useCoupon ?? 0,
              couponDesc: memberCouponData.couponDesc || '',
              couponType: 'member',
              usedTime: dayjs().toDate(),
            },
            { transaction },
          );
        }
      }

      // 8.如果下单有使用店铺优惠券，需要将这个店铺券写到订单优惠券表
      if (storeCoupons.length > 0) {
        await OrderCoupons.create(
          {
            orderSn: orderJson.orderSn,
            couponId: storeCoupons[0].id,
            usedValue: storeCoupons[0].couponValue,
            couponDesc: storeCoupons[0].couponDesc || '',
            couponType: 'store',
            usedTime: dayjs().toDate(),
          },
          { transaction },
        );
      }

      // 9.判断*当前*是否有店铺活动，如果有*满送活动*，需要判断*实际支付金额是否达成*，如果达成需要给用户优惠券表发券
      const storeActivity = await Marketing.findOne({
        where: {
          marketingType: 'full_send',
          marketingCondition: { [Op.lte]: actualAmount },
          startTime: { [Op.lte]: dayjs().toDate() },
          endTime: { [Op.gte]: dayjs().toDate() },
        },
        transaction,
      });

      if (storeActivity && buyer.phone) {
        const storeActivityData = storeActivity.toJSON();
        const storeActivityCoupons = await StoreCoupon.findAll({
          where: { activityId: storeActivityData.id },
          transaction,
        });

        const memberCoupons = storeActivityCoupons.flatMap((coupon) => {
          const couponData = coupon.toJSON();
          const couponCounts = couponData.couponCount || 1;
          return Array(couponCounts)
            .fill(null)
            .map(() => ({
              phone: buyer.phone,
              couponId: uuidv4(),
              couponCondition: couponData.couponCondition,
              couponDesc: couponData.couponDesc,
              couponValue: couponData.couponValue,
              couponCount: 1,
              couponStatus: 'active',
              couponExpiredTime: couponData.couponExpiredTime,
            }));
        });

        if (memberCoupons.length > 0) {
          await MemberCoupon.bulkCreate(memberCoupons, { transaction });
          await Member.increment(
            { coupon: memberCoupons.length },
            { where: { phone: buyer.phone }, transaction },
          );
        }
      }

      return orderJson;
    });

    // 买单成功了，需要发送消息到企业微信
    // const orderInfo = {
    //   '实付': orderData.orderActualAmount,
    //   '支付方式': orderData.payType,
    // };
    // // 从数据库中查询下今日订单列表，并计算今日订单数和今日实收金额
    // const todayOrderList = await Order.findAll({
    //   where: {
    //     createdAt: { [Op.gte]: dayjs().startOf('day').toDate(), [Op.lte]: dayjs().endOf('day').toDate() }
    //   }
    // });
    // const orderSummary = {
    //   '今日订单数': todayOrderList.length,
    //   '今日实收金额': todayOrderList.reduce(
    //     (acc, item) => acc + (item.get('orderActualAmount') as number),
    //     0
    //   ),
    // };
    // await weixinService.sendToWeChat(orderInfo, orderSummary);

    res.status(200).json(orderData);
  } catch (error) {
    logger.error('Error creating order:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 通过实付金额获取符合条件的店铺优惠券
export const getStoreCoupon = async (req: Request, res: Response) => {
  const amount = Number(req.query.amount);
  if (!Number.isFinite(amount)) {
    res.status(400).json({ error: '金额参数不合法' });
    return;
  }

  try {
    const coupon = await StoreCoupon.findAll({
      where: {
        couponStatus: 'active',
        couponExpiredTime: { [Op.gte]: dayjs().toDate() },
        couponCondition: { [Op.lte]: amount },
      },
      order: [['couponCondition', 'ASC']],
    });

    res.status(200).json(coupon);
  } catch (error) {
    logger.error('Error getting store coupon:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
