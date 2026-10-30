import { Request, Response } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import { z } from 'zod';
import logger from '../logger';
import ExcelJS from 'exceljs';
import Decimal from 'decimal.js';

import { Order } from '../model/order';

import { OrderItems } from '../model/orderItems';
import { Member } from '../model/member';
import { MemberScore } from '../model/memberScore';
import { MemberBalance } from '../model/memberBalance';
import { OrderCoupons } from '../model/orderCoupons';
import { Inventory } from '../model/inventory';
import { User } from '../model/user';
import { InventoryRecord } from '../model/inventoryRecord';

import oplog from '../service/oplog';
import { recalculatePersistedOrderItems } from '../service/orderPricing';
import { parseBody, findAllByInChunks, resolvePagination } from '../utils/query';

// 定义OrderItems的接口
interface OrderItemAttributes {
  orderSn: string;
  [key: string]: any;
}

const orderItemRefSchema = z
  .object({
    id: z.coerce.number().int().positive(),
    sku: z.string().min(1),
    counts: z.coerce.number().int().positive().default(1),
  })
  .passthrough();

const changeOrderSchema = z.object({
  orderSn: z.string().min(1),
  returnItems: z.array(orderItemRefSchema),
  exchangeItems: z.array(
    z
      .object({
        sku: z.string().min(1),
        sn: z.string().optional().default(''),
        name: z.string().optional().default(''),
        color: z.string().optional().default(''),
        size: z.string().optional().default(''),
        originalPrice: z.coerce.number().finite().optional().default(0),
        counts: z.coerce.number().int().positive().default(1),
      })
      .passthrough(),
  ),
  exchangeAmount: z.coerce.number().finite().min(0),
  amountType: z.enum(['none', 'add', 'sub']),
  refundBalance: z.coerce.boolean().optional().default(false),
});

const refundOrderSchema = z.object({
  orderSn: z.string().min(1),
  refundAmount: z.coerce.number().finite().min(0),
  refundItems: z.array(orderItemRefSchema),
  amountType: z.enum(['money', 'balance']),
});

// 查询订单中的商品列表
export const queryOrderItemList = async (req: Request, res: Response) => {
  const { orderSn } = req.query;

  const where = {};

  // 处理orderSn查询
  if (orderSn) {
    where['orderSn'] = {
      [Op.eq]: orderSn,
    };
  }

  try {
    const { count, rows } = await OrderItems.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100, // 每个订单中的商品数量上限是100个（约定）
      offset: 0,
    });
    // 这个orderItems表中写入的商品信息可能是乱码的，我们从库存表中去取到这些中文来替代字段（brand, name, size, color）
    if (rows && rows.length > 0) {
      const itemSkus = rows.map(item => item.get('sku') as string);
      const inventoryList = await Inventory.findAll({
        where: {
          sku: {
            [Op.in]: itemSkus,
          },
        },
      });
      const inventoryMap = new Map();
      inventoryList.forEach(item => {
        inventoryMap.set(item.get('sku'), item);
      });
      rows.forEach(item => {
        const sku = item.get('sku') as string;
        const inventory = inventoryMap.get(sku);
        if (inventory) {
          item.setDataValue('brand', inventory.get('brand'));
          item.setDataValue('name', inventory.get('name'));
          item.setDataValue('size', inventory.get('size'));
          item.setDataValue('color', inventory.get('color'));
        }
      });
    }
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting Order items:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
  
// 查询订单列表
export const queryOrderList = async (req: Request, res: Response) => {
  const { orderSn, start, end, userPhone, payType, salerId, pageSize, current, showStatus, orderType } = req.query;
  const { limit, offset } = resolvePagination(req.query);

  const where = {};

  // 处理orderSn查询
  if (orderSn) {
    where['orderSn'] = {
      [Op.eq]: orderSn,
    };
  }
  if (userPhone) {
    where['userPhone'] = {
      [Op.eq]: userPhone,
    };
  }
  if (payType) {
    where['payType'] = {
      [Op.eq]: payType,
    };
  }
  if (salerId) {
    where['salerId'] = {
      [Op.eq]: salerId,
    };
  }
  // 传入的值是hidden，则查询的结果会排除“隐藏的订单”，只展示“正常”的订单
  if (showStatus) {
    where['showStatus'] = {
      [Op.eq]: 'normal',
    };
  }

  // 订单类型：桌面端只展示普通销售单，充值单由汇总接口单独统计
  if (orderType) {
    where['orderType'] = {
      [Op.eq]: orderType,
    };
  }

  // 如果传入了会员号或者订单编码，则需要将showStatus的条件置空
  if (userPhone || orderSn) {
    delete where['showStatus'];
  }

  if (start && end) {
    const startTime = dayjs(start as string).startOf('day').toDate();
    const endTime = dayjs(end as string).endOf('day').toDate();

    where['createdAt'] = {
      [Op.gte]: startTime,
      [Op.lte]: endTime,
    };
  }

  try {
    const { count, rows } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting Orders:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询订单统计信息
export const queryOrderSummary = async (req: Request, res: Response) => {
  const { orderSn, start, end, showStatus, userPhone, payType, salerId } = req.query;

  const where = {};

  // 处理orderSn查询
  if (orderSn) {
    where['orderSn'] = {
      [Op.eq]: orderSn,
    };
  }
  if (userPhone) {
    where['userPhone'] = {
      [Op.eq]: userPhone,
    };
  }
  if (payType) {
    where['payType'] = {
      [Op.eq]: payType,
    };
  }
  if (salerId) {
    where['salerId'] = {
      [Op.eq]: salerId,
    };
  }
  // 传入的值是hidden，则查询的结果会排除“隐藏的订单”，只展示“正常”的订单
  if (showStatus) {
    where['showStatus'] = {
      [Op.eq]: 'normal',
    };
  }

  if (start && end) {
    const startTime = dayjs(start as string).startOf('day').toDate();
    const endTime = dayjs(end as string).endOf('day').toDate();

    where['createdAt'] = {
      [Op.gte]: startTime,
      [Op.lte]: endTime,
    };
  }
  try {
    // 先查询普通订单
    const rows = await Order.findAll({
      where: {
        ...where,
        orderType: {
          [Op.eq]: 'normal',
        },
      },
      order: [['createdAt', 'DESC']],
    });

    // 再查询充值订单
    const rechargeRows = await Order.findAll({
      where: {
        ...where,
        orderType: {
          [Op.eq]: 'income',
        },
      },
      order: [['createdAt', 'DESC']],
    });

    const orderCount = rows.length;
    const incomeAmount = rechargeRows.reduce((acc, curr) => new Decimal(acc).plus(curr.get('orderActualAmount') as number || 0).toNumber(), 0);
    if (orderCount === 0) {
      return res.json({
        orderCount: 0,
        orderActualAmount: 0,
        balanceAmount: 0,
        incomeAmount: rechargeRows.length > 0 ? incomeAmount : 0,
        itemCount: 0,
        payChannelStats: {
          alipay: 0,
          weixin: 0,
          cash: 0,
          card: 0,
          other: 0,
        },
      });
    }

    const orderActualAmount = rows.reduce((acc, curr) => new Decimal(acc).plus(curr.get('orderActualAmount') as number || 0).toNumber(), 0);
    const balanceAmount = rows.reduce((acc, curr) => new Decimal(acc).plus(curr.get('useBalance') as number || 0).toNumber(), 0); // 使用余额抵扣的金额
    const itemCount = rows.reduce((acc, curr) => acc + (curr.get('orderItems') as number || 0), 0);
    const payTypes = ['alipay', 'weixin', 'cash', 'card', 'other'];
    const payChannelStats = payTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});

    rows.forEach(curr => {
      const payType = curr.get('payType') as string || 'other';
      if (payTypes.includes(payType)) {
        payChannelStats[payType] = new Decimal(payChannelStats[payType]).plus(curr.get('orderActualAmount') as number || 0).toNumber();
      }
    });

    res.json({
      orderCount,
      orderActualAmount,
      balanceAmount,
      incomeAmount,
      itemCount,
      payChannelStats,
    });
  } catch (error) {
    logger.error('Error getting Order summary:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询订单详情
export const queryOrderDetail = async (req: Request, res: Response) => {
  const { orderSn } = req.query;
  try {
    const result = await Order.findOne({
      where: { orderSn }
    });
    if (result) {
      res.json(result.toJSON());
    } else {
      res.json({ error: 'Order not found' });
    }
  } catch (error) {
    logger.error('Error getting Order by ID:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 换货
export const changeOrderItem = async (req: Request, res: Response) => {
  const parsed = parseBody(changeOrderSchema, req.body, res);
  if (!parsed) return;
  const { orderSn, returnItems, exchangeItems, exchangeAmount, amountType, refundBalance } = parsed;
  if (returnItems.length === 0) {
    return res.json({ error: '请选择退货商品' });
  }
  if (exchangeItems.length === 0) {
    return res.json({ error: '请选择换货商品' });
  }
  try {
    // 1.更新订单表，根据价差更新订单实收金额，根据选择的商品数量差更新orderItems字段
    const order = await Order.findOne({
      where: { orderSn },
    });
    if (!order) {
      return res.json({ error: 'Order not found' });
    }
    const orderData = order.toJSON();
    const finnalChangeAmount = (amountType === 'none') ? 0 : (amountType === 'add' ? exchangeAmount : exchangeAmount * -1);
    const finalAmount = orderData.orderActualAmount + finnalChangeAmount;
    await order.update({
      orderActualAmount: refundBalance ? orderData.orderActualAmount : finalAmount, // 换货后，订单实收金额变动，如果是退余额，那这里就不修改实收了
      orderItems: orderData.orderItems - returnItems.reduce((sum, item) => sum + (item.counts || 1), 0) + exchangeItems.reduce((sum, item) => sum + (item.counts || 1), 0), // 换货后，订单中的商品数量减少
    });

    // 2.更新订单商品表，将退回的商品修改数据（修改后改条记录可以是0），将换货的商品添加
    for (const item of returnItems) {
      const tempOrderItems = await OrderItems.findOne({
        where: {
          orderSn,
          id: item.id,
        }
      });
      if (tempOrderItems) {
        await tempOrderItems.update({ status: 'refund' });
        await tempOrderItems.decrement('counts', { by: item.counts });
      }
    }
    await OrderItems.bulkCreate(
      exchangeItems.map(item => ({
        orderSn: orderData.orderSn,
        sku: item.sku,
        sn: item.sn,
        name: item.name,
        brand: item.brand,
        color: item.color,
        size: item.size,
        originalPrice: item.originalPrice,
        discount: 0,
        counts: item.counts,
        actualPrice: 0,
        status: 'exchangein',
      }))
    );
    // 3.扣减库存，退回的商品增加库存，换货的商品减少库存
    for (const item of returnItems) {
      // 先获取当前库存
      const inventory = await Inventory.findOne({
        where: { sku: item.sku }
      });
      if (inventory) {
        await Inventory.increment(
          { counts: item.counts, saleCounts: -item.counts },
          { where: { sku: item.sku } },
        );
        await InventoryRecord.create({
          sku: item.sku,
          type: 'exchangeIn',
          info: `订单[${orderSn}]换货退回`,
          count: item.counts || 1,
        });
      }
    }
    for (const item of exchangeItems) {
      // 先获取当前库存
      const inventory = await Inventory.findOne({
        where: { sku: item.sku }
      });
      if (inventory) {
        await Inventory.increment(
          { counts: -item.counts, saleCounts: item.counts },
          { where: { sku: item.sku } },
        );
        await InventoryRecord.create({
          sku: item.sku,
          type: 'exchangeOut',
          info: `订单[${orderSn}]换货出库`,
          count: item.counts || 1,
        });
      }
    }
    // 4.更新会员表，因实付金额的变动，需要更新会员表中的实付金额和积分
    if (orderData.userPhone && finnalChangeAmount !== 0) {
      const member = await Member.findOne({
        where: { phone: orderData.userPhone },
      });
      if (member) {
        await Member.increment(
          {
            actual: finnalChangeAmount,
            point: Math.floor(finnalChangeAmount),
          },
          { where: { phone: orderData.userPhone } },
        );
        // 添加积分记录
        await MemberScore.create({
          phone: orderData.userPhone,
          point: Math.floor(finnalChangeAmount),
          type: 'exchange',
          reason: `订单${orderSn}换货积分变动`,
        });
      }
    }

    // 如果是退钱给用户，并且是通过退余额的方式
    if (amountType === 'sub' && refundBalance) {
      // 退余额（更新订单中使用的余额，更新会员的余额，写入余额变动记录）
      await order.update({
        useBalance: (new Decimal(orderData.useBalance).minus(exchangeAmount)).toNumber(), // 退货后，订单中使用的余额需要回退
      });
      await Member.increment(
        { balance: exchangeAmount },
        { where: { phone: orderData.userPhone } },
      );
      // 添加余额变动记录
      await MemberBalance.create({
        phone: orderData.userPhone,
        value: exchangeAmount,
        type: 'refund',
        reason: `订单${orderSn}换货退价差`,
      });
    }

    // 5.重新扫描该订单下的有效商品，统一重算吊牌价、应收金额、实收价和折扣
    const latestOrderData = (await order.reload()).toJSON();
    const finalOrderItems = await OrderItems.findAll({
      where: {
        orderSn,
        counts: {
          [Op.gt]: 0,
        }
      }
    });
    const pricing = await recalculatePersistedOrderItems({
      items: finalOrderItems,
      orderActualAmount: latestOrderData.orderActualAmount,
      useBalance: latestOrderData.useBalance,
      updateItem: (id, values) => OrderItems.update(values, { where: { id } }),
    });

    await order.update({
      originalAmount: pricing.originalAmount,
      orderAmount: pricing.orderAmount,
    });

    // 写入操作日志，记录关键的事件
    const changeItemsStr = exchangeItems.map(item => `${item.sku}[${item.counts}]`).join(',');
    const returnItemsStr = returnItems.map(item => `${item.sku}[${item.counts}]`).join(',');
    let finalAmountStr = String(amountType === 'add' ? exchangeAmount : -1 * exchangeAmount);
    if (refundBalance && amountType === 'sub') {
      finalAmountStr = `${finalAmountStr}(退余额)`;
    }
    await oplog('exchange', `订单[${orderSn}]换货操作,换回:${returnItemsStr},换出:${changeItemsStr},换货金额:${finalAmountStr},价差类型:${amountType}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error changing order item:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 退货 
export const refundOrderItem = async (req: Request, res: Response) => {
  const parsed = parseBody(refundOrderSchema, req.body, res);
  if (!parsed) return;
  const { orderSn, refundAmount, refundItems, amountType } = parsed;
  if (refundItems.length === 0) {
    return res.json({ error: '请选择退货商品' });
  }
  try {
    // 1.更新订单表
    const order = await Order.findOne({
      where: { orderSn },
    });
    if (!order) {
      return res.json({ error: 'Order not found' });
    }
    const orderData = order.toJSON();
    // 使用Decimal处理金额相关的计算，避免精度问题
    const decOrderActualAmount = new Decimal(orderData.orderActualAmount).minus(refundAmount);

    // 退实际支付的金额
    if (amountType === 'money') {
      await order.update({
        orderStatus: 'refund', // 退货后，订单状态为退货
        orderActualAmount: decOrderActualAmount.toNumber(), // 退货后，订单实收金额减少
        orderItems: orderData.orderItems - refundItems.reduce((sum, item) => sum + (item.counts || 1), 0), // 退货后，订单中的商品数量减少
      });
    } else {
      // 退余额（更新订单中使用的余额，更新会员的余额，写入余额变动记录）
      await order.update({
        orderStatus: 'refund', // 退货后，订单状态为退货
        useBalance: (new Decimal(orderData.useBalance).minus(refundAmount)).toNumber(), // 退货后，订单中使用的余额需要回退
        orderItems: orderData.orderItems - refundItems.reduce((sum, item) => sum + (item.counts || 1), 0), // 退货后，订单中的商品数量减少
      });
      await Member.increment(
        { balance: refundAmount },
        { where: { phone: orderData.userPhone } },
      );
      // 添加余额变动记录
      await MemberBalance.create({
        phone: orderData.userPhone,
        value: refundAmount,
        type: 'refund',
        reason: `订单${orderSn}退货`,
      });
    }

    // 2.更新订单商品表，将退回的商品修改数据（修改后改条记录可以是0）
    for (const item of refundItems) {
      const tempOrderItems = await OrderItems.findOne({
        where: {
          orderSn,
          id: item.id,
        }
      });
      if (tempOrderItems) {
        await tempOrderItems.update({ status: 'refund' });
        await tempOrderItems.decrement('counts', { by: item.counts });
      }
    }

    // 3.回滚库存 - 对每个退货商品分别处理
    for (const item of refundItems) {
      await Inventory.increment(
        { counts: item.counts, saleCounts: -item.counts },
        { where: { sku: item.sku } },
      );
      await InventoryRecord.create({
        sku: item.sku,
        type: 'returnIn',
        info: `订单[${orderSn}]退货回库`,
        count: item.counts || 1,
      });
    }
    
    // 4.更新会员表
    if (orderData.userPhone) {
      const member = await Member.findOne({
        where: { phone: orderData.userPhone },
      });
      if (member) {
        // 如果是退余额，则不回滚积分，只有退钱时才回滚积分
        if (amountType === 'money') {
          await Member.increment(
            {
              point: -Math.floor(refundAmount),
              actual: -refundAmount,
            },
            { where: { phone: orderData.userPhone } },
          );
          // 添加积分记录（回滚积分）
          await MemberScore.create({
            phone: orderData.userPhone,
            point: -1 * Math.floor(refundAmount),
            type: 'refund',
            reason: `订单${orderSn}退货回滚积分`,
          });
        }
      }
    }

    // 5.重新扫描该订单下的有效商品，统一重算吊牌价、应收金额、实收价和折扣
    const latestOrderData = (await order.reload()).toJSON();
    const finalOrderItems = await OrderItems.findAll({
      where: {
        orderSn,
        counts: {
          [Op.gt]: 0,
        }
      }
    });
    const pricing = await recalculatePersistedOrderItems({
      items: finalOrderItems,
      orderActualAmount: latestOrderData.orderActualAmount,
      useBalance: latestOrderData.useBalance,
      updateItem: (id, values) => OrderItems.update(values, { where: { id } }),
    });
    
    await order.update({
      originalAmount: pricing.originalAmount,
      orderAmount: pricing.orderAmount,
    });

    // 写入操作日志，记录关键的事件
    const returnItemsStr = refundItems.map(item => `${item.sku}[${item.counts}]`).join(',');
    await oplog('return', `订单[${orderSn}]退货操作,退回商品:${returnItemsStr},退金额:${refundAmount},退款类型:${amountType}`);

    res.json({ success: true });
  } catch (error) {
    logger.error('Error refunding order item:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 根据SKU查询订单
export const queryOrderBySku = async (req: Request, res: Response) => {
  const { sku } = req.query;
  try {
    // 先从订单商品表中找到订单
    const result = await OrderItems.findAll({
      where: { sku },
      limit: 100, 
      offset: 0,
      order: [['createdAt', 'DESC']],
      attributes: ['orderSn'],
    }) as unknown as OrderItemAttributes[];
    
    // 再根据订单ID查询订单详情
    const orderList = await Order.findAndCountAll({
      where: { 
        orderSn: result.map(item => item.orderSn)
      },
      order: [['createdAt', 'DESC']],
      limit: 100,
      offset: 0,
    });
    res.json({
      count: orderList.count || 0,
      data: orderList.rows || [],
    });
  } catch (error) {
    logger.error('Error getting Order by SKU:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 确认订单 对账
export const checkOrderBill = async (req: Request, res: Response) => {
  const { orderSn } = req.query;
  try {
    const result = await Order.findOne({
      where: { orderSn }
    });
    if (!result) {
      return res.json({ error: 'Order not found' });
    }
    await result.update({ orderStatus: 'checked' });
    res.json(result.toJSON());
  } catch (error) {
    logger.error('Error checking order bill:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 更新订单
export const modifyOrder = async (req: Request, res: Response) => {
  const { orderId } = req.query;
  const { payType, orderActualAmount, salerId, userPhone, remark, orderSn: orderSnFromClient  } = req.body;
  const currentUserId = req.headers['x-user-id'] as string;

  try {
    const result = await Order.findOne({
      where: {
        id: orderId,
      },
    });
    
    if (!result) {
      return res.json({ error: 'Order not found' });
    }

    const orderData = result.toJSON();
    const orderSn = orderData.orderSn;
    const originalUserPhone = orderData.userPhone;

    console.info('modifyOrder:', orderSnFromClient, payType, orderActualAmount, salerId, userPhone, remark);

    // 如果修改了订单号，需要对新订单号做唯一性判断
    if (orderSnFromClient && orderSnFromClient !== orderData.orderSn) {
      const duplicate = await Order.findOne({
        where: { orderSn: orderSnFromClient },
      });
      if (duplicate) {
        return res.json({ error: '你修改的订单号已经存在' });
      }
    }

    // 之前没有绑定会员，现在需要绑定会员
    if (!originalUserPhone && userPhone) {
      // Check if member exists
      let member = await Member.findOne({
        where: { phone: userPhone }
      });

      if (!member) {
        // 如果会员不存在，则创建会员，加上积分和消费金额
        member = await Member.create({
          phone: userPhone,
          actual: orderActualAmount,
          point: Math.floor(orderActualAmount), // Convert amount to points
        });
      } else {
        // 如果会员存在，则更新积分和消费金额
        const memberData = member.toJSON();
        await member.update({
          actual: Number((memberData.actual + orderActualAmount).toFixed(2)),
          point: memberData.point + Math.floor(orderActualAmount),
        });
      }

      // 添加积分记录
      await MemberScore.create({
        phone: userPhone,
        point: Math.floor(orderActualAmount),
        type: 'earn',
        reason: `订单${orderSn}支付获取积分`
      });
    }

    // 换绑会员
    if (originalUserPhone && originalUserPhone !== userPhone) {
      // Check if member exists
      let member = await Member.findOne({
        where: { phone: userPhone }
      });

      if (!member) {
        // 如果会员不存在，则创建会员，加上积分和消费金额
        member = await Member.create({
          phone: userPhone,
          actual: orderActualAmount,
          point: Math.floor(orderActualAmount), // Convert amount to points
        });
      } else {
        // 如果会员存在，则更新积分和消费金额
        const memberData = member.toJSON();
        await member.update({
          actual: Number((memberData.actual + orderActualAmount).toFixed(2)),
          point: memberData.point + Math.floor(orderActualAmount),
        });
      }

      // 添加积分记录
      await MemberScore.create({
        phone: userPhone,
        point: Math.floor(orderActualAmount),
        type: 'earn',
        reason: `订单${orderSn}支付获取积分`
      });
      
      // 原来的会员积分需要移除
      let oldMember = await Member.findOne({
        where: { phone: originalUserPhone }
      });
      if (oldMember) {
        const oldMemberData = oldMember.toJSON();
        await oldMember.update({
          actual: Number((oldMemberData.actual - orderActualAmount).toFixed(2)),
          point: oldMemberData.point - Math.floor(orderActualAmount),
        });
        await MemberScore.create({
          phone: originalUserPhone,
          point: Math.floor(orderActualAmount),
          type: 'manualReduce',
          reason: `订单${orderSn}换绑其他会员扣除积分`
        });
      }
    }

    // 订单实付金额有变化的话，需要更新会员表中的实付金额和积分
    if (originalUserPhone && orderActualAmount !== orderData.orderActualAmount) {
      const member = await Member.findOne({
        where: { phone: orderData.userPhone },
      });
      if (member) {
        const memberData = member.toJSON();
        await member.update({
          actual: memberData.actual + (orderActualAmount - orderData.orderActualAmount),
          point: memberData.point + Math.floor(orderActualAmount - orderData.orderActualAmount),
        });
        // 添加积分记录
        await MemberScore.create({
          phone: orderData.userPhone,
          point: Math.floor(orderActualAmount - orderData.orderActualAmount),
          type: 'earn',
          reason: `订单${orderSn}实付金额调整,积分变动`,
        });
      }
    }

    // 更新订单基本信息（支付方式、实收金额、导购员[id, name]、会员、备注）
    let salerName = '';
    if (salerId) {
      const saler = await User.findOne({
        where: { id: salerId },
      });
      if (saler) {
        const salerData = saler.toJSON();
        // 导购员展示名：优先真实姓名，未设置时回退用户名
        salerName = salerData.realName || salerData.name;
      } else {
        logger.error('Error getting saler:');
        console.log(saler);
      }
    }
    const updateData: any = { payType, salerId, salerName, userPhone, remark, orderActualAmount: orderData.orderActualAmount };
    // 如果修改了订单号
    if (orderSnFromClient && orderSnFromClient !== orderData.orderSn) {
      updateData.orderSn = orderSnFromClient;
    }
    // 订单没有完成对账才能修改实付金额，否则不能修改，防止导购员修改实付金额，但是管理员可以，currentUserId == 1是管理员
    if (orderData.orderStatus !== 'checked' || Number(currentUserId) == 1) {
      updateData.orderActualAmount = orderActualAmount;
    }
    await result.update(updateData);

    // 订单实付金额变化且允许修改时，统一重算有效商品的实收价和折扣
    // 完成对账了不能修改实收了，但是管理员可以，currentUserId == 1是管理员
    const canModify = Number(currentUserId) == 1 || orderData.orderStatus !== 'checked';
    if (canModify && orderActualAmount !== orderData.orderActualAmount) {
      const latestOrderData = (await result.reload()).toJSON();
      const finalOrderItems = await OrderItems.findAll({
        where: {
          orderSn,
          counts: {
            [Op.gt]: 0,
          }
        },
        order: [['createdAt', 'DESC']],
      });
      const pricing = await recalculatePersistedOrderItems({
        items: finalOrderItems,
        orderActualAmount: latestOrderData.orderActualAmount,
        useBalance: latestOrderData.useBalance,
        updateItem: (id, values) => OrderItems.update(values, { where: { id } }),
      });

      await result.update({
        originalAmount: pricing.originalAmount,
        orderAmount: pricing.orderAmount,
      });
    }

    // 写入操作日志，记录关键的事件
    let info = '';
    if (originalUserPhone !== userPhone) {
      info += `会员由${originalUserPhone || ' '}变更为${userPhone};`;
    }
    if (orderData.payType !== payType) {
      info += `支付方式由${orderData.payType}变更为${payType};`;
    }
    if (orderData.orderActualAmount !== orderActualAmount) {
      info += `实付金额由${orderData.orderActualAmount}变更为${orderActualAmount};`;
    }
    if (orderData.salerName !== salerName) {
      info += `导购员由${orderData.salerName}变更为${salerName};`;
    }
    if (orderData.remark !== remark) {
      info += `备注由${orderData.remark}变更为${remark};`;
    }
    if (orderData.orderSn !== orderSnFromClient) {
      info += `订单号由${orderData.orderSn}变更为${orderSnFromClient};`;
    }

    oplog('modifyOrder', `订单[${orderSn}]信息被修改,修改信息:${info}`);

    res.json(result.toJSON());
  } catch (error) {
    logger.error('Error modify Order:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询订单中的优惠券列表
export const queryOrderCouponList = async (req: Request, res: Response) => {
  const { orderSn } = req.query;

  const where = {};

  // 处理orderSn查询
  if (orderSn) {
    where['orderSn'] = {
      [Op.eq]: orderSn,
    };
  }

  try {
    const { count, rows } = await OrderCoupons.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 100, // 每个订单中的优惠券数量上限是100个（约定）
      offset: 0,
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting Order coupons:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 导出订单
export const exportOrder = async (req: Request, res: Response) => {
  const { orderSnList } = req.body;
  try {
    const result = await findAllByInChunks(Order, 'orderSn', orderSnList);
    if (!result) {
      return res.json({ error: 'Order not found' });
    }
    // 将结果写入excel文件
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Orders');
    worksheet.addRow(['orderSn', 'orderActualAmount', 'orderItems', 'payType', 'userPhone', 'salerName', 'createdAt', 'extra']);
    const orderData = (result as any[]).map(item => item.toJSON());
    orderData.forEach(item => {
      worksheet.addRow([
        item.orderSn, 
        item.orderActualAmount, 
        item.orderItems, 
        item.payType, 
        item.userPhone, 
        item.salerName, 
        dayjs(item.createdAt).format('YYYY-MM-DD HH:mm:ss'),
        item.extra
      ]);
    });
    // 将文件写入响应
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=orders-${dayjs().format('YYYY-MM-DD')}.xlsx`);
    workbook.xlsx.write(res);
  } catch (error) {
    logger.error('Error exporting order:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询订单下的商品列表
export const queryOrderItemListByDate = async (req: Request, res: Response) => {
  const { start, end, pageSize, current, showStatus } = req.query;
  const { limit, offset } = resolvePagination(req.query);

  const orderSnList: any[] = [];
  const orderActualMap: Record<string, number> = {};
  const orderCreatedMap: Record<string, string> = {};
  const orderItemCountMap: Record<string, number> = {};
  if (start && end) {
    const startTime = dayjs(start as string).startOf('day').toDate();
    const endTime = dayjs(end as string).endOf('day').toDate();

    const where: any = {
      createdAt: {
        [Op.gte]: startTime,
        [Op.lte]: endTime,
      },
      orderType: {
        [Op.eq]: 'normal',
      },
    };
    // 传入的值是hidden，则查询的结果会排除“隐藏的订单”，只展示“正常”的订单
    if (showStatus) {
      where['showStatus'] = {
        [Op.eq]: 'normal',
      };
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
    });
    // 将订单的orderSn字段取出来，构造成为下次查询的条件
    // 将订单的orderSn和orderActualAmount字段取出来，构造成为map
    rows.forEach((row: any) => {
      orderActualMap[row.orderSn] = row.orderActualAmount;
      orderCreatedMap[row.orderSn] = row.createdAt;
      orderItemCountMap[row.orderSn] = row.orderItems;
      orderSnList.push(row.orderSn);
    });
  }

  try {
    const { count, rows } = await OrderItems.findAndCountAll({
      where: {
        orderSn: {
          [Op.in]: orderSnList,
        },
      },
      order: [['orderSn', 'DESC']],
      limit,
      offset,
    });
    // 将orderActualAmount添加到rows中，并转换为普通对象
    const dataWithActualAmount = rows.map((row: any) => {
      const rowData = row.toJSON ? row.toJSON() : row;
      return {
        ...rowData,
        orderActualAmount: orderActualMap[rowData.orderSn] || 0,
        orderCreatedAt: orderCreatedMap[rowData.orderSn] || null,
        orderItemCount: orderItemCountMap[rowData.orderSn] || 0,
      };
    });
    res.json({
      count: count || 0,
      data: dataWithActualAmount || [],
    });
  } catch (error) {
    logger.error('Error getting Order items by date:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 参考queryOrderItemListByDate，实现写入excel，给到前端下载
export const exportOrderItemList = async (req: Request, res: Response) => {
  const { start, end, showStatus } = req.body;

  const orderSnList: any[] = [];
  const orderActualMap: Record<string, number> = {};
  const orderPayTypeMap: Record<string, string> = {};
  const ordeItemCountsMap: Record<string, number> = {};
  if (start && end) {
    const startTime = dayjs(start as string).startOf('day').toDate();
    const endTime = dayjs(end as string).endOf('day').toDate();

    const where: any = {
      createdAt: {
        [Op.gte]: startTime,
        [Op.lte]: endTime,
      },
      orderType: {
        [Op.eq]: 'normal',
      },
    };
    // 传入的值是hidden，则查询的结果会排除“隐藏的订单”，只展示“正常”的订单
    if (showStatus === 'hidden') {
      where['showStatus'] = {
        [Op.eq]: 'normal',
      };
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
    });
    // 将订单的orderSn字段取出来，构造成为下次查询的条件
    // 将订单的orderSn和orderActualAmount字段取出来，构造成为map
    rows.forEach((row: any) => {
      orderActualMap[row.orderSn] = row.orderActualAmount;
      orderPayTypeMap[row.orderSn] = row.payType;
      ordeItemCountsMap[row.orderSn] = row.orderItems;
      orderSnList.push(row.orderSn);
    });
  }

  try {
    const { count, rows } = await OrderItems.findAndCountAll({
      where: {
        orderSn: {
          [Op.in]: orderSnList,
        },

      },
      order: [['orderSn', 'DESC']],
    });
    // 将orderActualAmount添加到rows中，并转换为普通对象
    const dataWithActualAmount = rows.map((row: any) => {
      const rowData = row.toJSON ? row.toJSON() : row;
      return {
        ...rowData,
        orderActualAmount: orderActualMap[rowData.orderSn] || 0,
        payType: orderPayTypeMap[rowData.orderSn] || '',
        totalCounts: ordeItemCountsMap[rowData.orderSn] || 0,
      };
    });

    // 将结果写入excel文件
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('default');
    
      const fileName = `export-order-items-${dayjs().format('YYYY-MM-DD-HH-mm-ss')}.xlsx`;
      worksheet.addRow(['订单号', '订单实收', '商品总数', '支付方式', '条码', '数量', '尺码/颜色', '商品实收']);
      
      // 记录每个订单号的起始行和行数
      const orderMergeMap: Record<string, { startRow: number; rowCount: number }> = {};
      let currentRow = 2; // 从第2行开始（第1行是表头）
      
      dataWithActualAmount.forEach(item => {
        if (item.counts) { // 有商品才写入
          worksheet.addRow([
            item.orderSn,
            item.orderActualAmount,
            item.totalCounts,
            item.payType,
            item.sku,
            item.counts,
            `${item.size}/${item.color}`,
            `${item.actualPrice > 0 ? item.actualPrice : '---'}`,
          ]);
          
          // 记录订单号的行信息
          if (!orderMergeMap[item.orderSn]) {
            orderMergeMap[item.orderSn] = {
              startRow: currentRow,
              rowCount: 1,
            };
          } else {
            orderMergeMap[item.orderSn].rowCount++;
          }
          currentRow++;
        }
      });
      
      // 合并单元格：订单号(A列)、订单实收(B列)、商品总数(C列)、支付方式(D列)
      Object.values(orderMergeMap).forEach(({ startRow, rowCount }) => {
        if (rowCount > 1) {
          const endRow = startRow + rowCount - 1;
          // 合并订单号列 (A列)
          worksheet.mergeCells(`A${startRow}:A${endRow}`);
          // 合并订单实收列 (B列)
          worksheet.mergeCells(`B${startRow}:B${endRow}`);
          // 合并商品总数列 (C列)
          worksheet.mergeCells(`C${startRow}:C${endRow}`);
          // 合并支付方式列 (D列)
          worksheet.mergeCells(`D${startRow}:D${endRow}`);
        }
      });
      
      // 设置所有列宽为200px（Excel中宽度单位需要转换，约等于28个字符宽度）
      worksheet.columns.forEach(column => {
        column.width = 28; // 约等于200px
      });
      
      // 设置所有单元格居中对齐和黑色边框（包括表头和数据行）
      worksheet.eachRow((row, rowNumber) => {
        // 设置行高为30px（Excel中高度单位是磅，30px约等于22.5磅）
        row.height = 22.5;
        
        row.eachCell((cell) => {
          // 居中对齐
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          
          // 添加黑色边框
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } }
          };
          
          // 表头加粗（第1行）
          if (rowNumber === 1) {
            cell.font = { bold: true };
          }
        });
      });
      
      // 冻结表头（固定第一行，滚动时表头不动）
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];
        
      // 将文件写入响应
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      workbook.xlsx.write(res);
  } catch (error) {
    logger.error('Error getting Order items on export by date:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 更新订单的打印状态
export const updatePrintStatus = async (req: Request, res: Response) => {
  const { orderSn, printStatus } = req.body;
  try {
    const result = await Order.findOne({
      where: { orderSn }
    });
    if (!result) {
      return res.json({ error: 'Order not found' });
    }
    await result.update({ printStatus });
    res.json(result.toJSON());
  } catch (error) {
    logger.error('Error updating print status:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 切换订单的展示状态
export const toggleShow = async (req: Request, res: Response) => {
  const { orderSn, showStatus } = req.body;
  try {
    const result = await Order.findOne({
      where: { orderSn }
    });
    if (!result) {
      return res.json({ error: 'Order not found' });
    }
    await result.update({ showStatus });
    res.json(result.toJSON());
  } catch (error) {
    logger.error('Error toggling show status:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 查询订单毛利率
export const queryOrderRate = async (req: Request, res: Response) => {
  const { orderSn } = req.query;
  try {
    // 通过orderSn查询订单的实收金额（如果是使用了余额，实收金额就是：实收+使用余额）
    const order = await Order.findOne({
      where: { orderSn },
    });
    if (!order) {
      return res.json({ error: 'Order not found' });
    }
    const orderData = order.toJSON();
    const result = await OrderItems.findAll({
      where: { orderSn }
    });
    if (!result) {
      return res.json({ error: 'Order not found' });
    }
    // 毛利率的计算是：先从OrderItems中查询商品，然后去Inventory中查询商品的进货价，然后计算毛利率
    const orderItems = result.map(item => item.toJSON());
    // 根据orderItems中的sku去Inventory中查询商品的进货价
    const inventoryList = await findAllByInChunks(
      Inventory,
      'sku',
      orderItems.map(item => item.sku),
    );
    
    // Create a map of inventory items with proper type handling
    const inventoryMap = new Map(
      (inventoryList as any[]).map(item => {
        const data = item.toJSON();
        return [data.sku, data];
      })
    );
    
    // 计算总的进货价
    const totalCost = orderItems.reduce((acc, item) => {
      const inventoryItem = inventoryMap.get(item.sku);
      return new Decimal(acc).plus(new Decimal(inventoryItem?.costPrice || 0).mul(item.counts)).toNumber();
    }, 0);
  
    // 获取订单实收
    const actualAmount = (orderData.orderActualAmount || 0) + (orderData.useBalance || 0); ;
    
    // Calculate rate only if actualAmount is not zero to avoid division by zero
    const rate = actualAmount > 0 ? ((actualAmount - totalCost) / actualAmount * 100) : 0;
    
    res.json({
      rate: rate.toFixed(2),
    });
  } catch (error) {
    logger.error('Error querying order rate:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
