import { Request, Response } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import logger from '../logger';

import { sequelize } from '../model/index';
import { Order } from '../model/order';
import { Inventory } from '../model/inventory';
import { Member } from '../model/member';
import { OrderItems } from '../model/orderItems'; 
import { chunkArray, findAllByInChunks } from '../utils/query';

// 查询系统核心的统计数据
export const getCoreData = async (req: Request, res: Response) => {
  const dateRange = req.body.dateRange as string[];
  const showStatus = req.body.showStatus as string;

  let startTime, endTime;

  try {
    // 处理日期范围
    if (dateRange && Array.isArray(dateRange) && dateRange.length === 2) {
      startTime = dayjs(dateRange[0]).startOf('day').toDate();
      endTime = dayjs(dateRange[1]).endOf('day').toDate();
    } else {
      // 默认查询最近30天
      startTime = dayjs().subtract(30, 'days').startOf('day').toDate();
      endTime = dayjs().endOf('day').toDate();
    }

    // 根据showStatus查询订单
    const orderWhere = {
      createdAt: {
        [Op.between]: [startTime, endTime]
      },
      orderType: {
        [Op.eq]: 'normal',
      },
    };
    if (showStatus === 'hidden') {
      orderWhere['showStatus'] = 'normal';
    }

    // const currentUserId = req.headers['x-user-id'] as string;

    // 并行查询所有统计数据
    const [orderStats, orderSnRows, inventoryCount, memberCount, memberBalance] = await Promise.all([
      // 查询订单统计
      Order.findAll({
        where: orderWhere,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'orderCount'],
          [sequelize.fn('SUM', sequelize.col('orderActualAmount')), 'totalAmount'],
          [sequelize.fn('SUM', sequelize.col('useBalance')), 'totalBalance'],
        ],
        raw: true
      }),
      // 区间内订单号，用于统计售出商品数量
      Order.findAll({
        where: orderWhere,
        attributes: ['orderSn'],
        raw: true
      }),
      // 查询库存总量
      Inventory.sum('counts'),
      // 查询会员总量
      Member.count(),
      // 查询会员余额
      Member.findAll({
        attributes: [
          [sequelize.fn('SUM', sequelize.col('balance')), 'balance']
        ],
        raw: true
      }),
    ]);

    // 售出商品数量按区间内订单统计，而非全量历史；订单号分批 IN，避免超长 SQL
    const orderSns = (orderSnRows as any[]).map((item) => item.orderSn);
    let saledItemCount = 0;
    for (const group of chunkArray(orderSns, 500)) {
      saledItemCount += Number(
        (await OrderItems.sum('counts', {
          where: { orderSn: { [Op.in]: group } },
        })) || 0,
      );
    }

    // 处理订单统计结果
    const orderCount = (orderStats[0] as any)?.orderCount || 0;
    const totalAmount = (orderStats[0] as any)?.totalAmount || 0;
    const totalBalance = (orderStats[0] as any)?.totalBalance || 0;

    res.json({
      orderCount: Number(orderCount),
      orderAmount: Number(totalAmount),
      totalBalance: Number(totalBalance),
      inventoryCount: Number(inventoryCount || 0),
      memberCount: Number(memberCount || 0),
      saledItemCount: Number(saledItemCount || 0),
      memberBalance: Number((memberBalance[0] as any)?.balance || 0),
    });
  } catch (error) {
    logger.error('Error getting core data:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询订单图表数据
export const getOrderCharts = async (req: Request, res: Response) => {
  const showStatus = req.query.showStatus as string;

  const startTime = dayjs().subtract(365, 'days').startOf('day').toDate();
  const endTime = dayjs().endOf('day').toDate();

  // 根据showStatus查询订单
  const orderWhere = {
    createdAt: {
      [Op.between]: [startTime, endTime]
    },
    orderType: {
      [Op.eq]: 'normal',
    },
  };
  if (showStatus === 'hidden') {
    orderWhere['showStatus'] = 'normal';
  }

  try {
    // 查询订单图表数据
    const orderCharts = await Order.findAll({
      where: orderWhere,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y/%m'), 'month'],
        [sequelize.fn('SUM', sequelize.col('orderActualAmount')), 'amounts'],
        [sequelize.fn('SUM', sequelize.col('useBalance')), 'totalBalance'],
      ],
      group: ['month'],
      order: [['month', 'ASC']],
    });

    const outputData = orderCharts.map(item => {
      const obj = item.toJSON();
      obj.amounts = Number(obj.amounts) + Number(obj.totalBalance);
      return obj;
    });

    // 查询符合条件的订单
    const order = await Order.findAll({
      where: orderWhere,
    });

    // 查询符合条件的订单商品
    const orderList = order.map(item => item.toJSON());
    const orderItemsResult = await findAllByInChunks(
      OrderItems,
      'orderSn',
      orderList.map(item => item.orderSn),
    );

    // 查询符合条件的订单商品的进货价
    const orderItems = (orderItemsResult as any[]).map(item => item.toJSON());
    const inventoryList = await findAllByInChunks(
      Inventory,
      'sku',
      orderItems.map(item => item.sku),
    );
    
    // 将商品进货价转换为map
    const inventoryMap = new Map(
      (inventoryList as any[]).map(item => {
        const data = item.toJSON();
        return [data.sku, data];
      })
    );

    // 订单按月统计这些订单中商品的总进货价
    // 1. 构建订单号到月份的映射
    const orderSnToMonth = new Map<string, string>();
    order.forEach(item => {
      const month = dayjs(item.get('createdAt') as string).format('YYYY/MM');
      orderSnToMonth.set(item.get('orderSn') as string, month);
    });

    // 2. 统计每月进货价
    const monthCostMap = new Map<string, number>();
    orderItems.forEach(item => {
      const month = orderSnToMonth.get(item.orderSn);
      const inventory = inventoryMap.get(item.sku);
      const costPrice = inventory ? Number(inventory.costPrice) : 0;
      const totalCost = costPrice * item.counts;
      if (month) {
        monthCostMap.set(month, Number(((monthCostMap.get(month) || 0) + totalCost).toFixed(2)));
      }
    });

    // 3. 合并到outputData
    outputData.forEach(obj => {
      obj.cost = Number(monthCostMap.get(obj.month) || 0);
      obj.rate = obj.amounts > 0 ? Number(((obj.amounts - obj.cost) / obj.amounts * 100).toFixed(2)) : 0;
    });

    res.json(outputData);
  } catch (error) {
    logger.error('Error getting order charts:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 导购员营业额按月查看（充值单+购物单，谁带来的充值算谁的，消费单上只算实际的支付金额，谁导购算谁的）
export const getSalerCharts = async (req: Request, res: Response) => {
  const showStatus = req.query.showStatus as string;

  const startTime = dayjs().subtract(365, 'days').startOf('day').toDate();
  const endTime = dayjs().endOf('day').toDate();

  const currentUserId = req.headers['x-user-id'] as string;

  // 根据showStatus查询订单
  const orderWhere = {
    salerId: {
      [Op.eq]: Number(currentUserId),
    },
    // orderType: {
    //   [Op.eq]: 'normal',
    // },
    createdAt: {
      [Op.between]: [startTime, endTime]
    }
  };
  if (showStatus === 'hidden') {
    orderWhere['showStatus'] = 'normal';
  }

  try {
    // 查询订单图表数据
    const orderCharts = await Order.findAll({
      where: orderWhere,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%Y/%m'), 'month'],
        [sequelize.fn('SUM', sequelize.col('orderActualAmount')), 'amounts'],
        [sequelize.fn('SUM', sequelize.col('useBalance')), 'totalBalance'],
      ],
      group: ['month'],
      order: [['month', 'ASC']],
    });

    // 将查询结果转换为Map，方便后续处理
    const monthlyDataMap = new Map();
    orderCharts.forEach(item => {
      const obj = item.toJSON();
      monthlyDataMap.set(obj.month, Number(obj.amounts) + Number(obj.totalBalance));
      // monthlyDataMap.set(obj.month, Number(obj.amounts));
    });

    // 生成完整的12个月数据，没有数据的月份设置为0
    const outputData: { month: string, amounts: number }[] = [];
    const currentDate = dayjs();
    
    // 生成过去12个月的数据
    for (let i = 11; i >= 0; i--) {
      const monthDate = currentDate.subtract(i, 'month');
      const monthStr = monthDate.format('YYYY/MM');
      outputData.push({
        month: monthStr,
        amounts: monthlyDataMap.get(monthStr) || 0
      });
    }

    res.json(outputData);
  } catch (error) {
    logger.error('Error getting saler charts:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 导购员营业额按日查看（充值单+购物单）
export const getSalerDailyCharts = async (req: Request, res: Response) => {
  const month = req.query.month as string;
  const showStatus = req.query.showStatus as string;

  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }

  const currentUserId = req.headers['x-user-id'] as string;

  // 解析月份，获取该月的开始和结束时间
  const startTime = dayjs(month).startOf('month').toDate();
  const endTime = dayjs(month).endOf('month').toDate();

  // 根据showStatus查询订单
  const orderWhere = {
    salerId: {
      [Op.eq]: Number(currentUserId),
    },
    // orderType: {
    //   [Op.eq]: 'normal',
    // },
    createdAt: {
      [Op.between]: [startTime, endTime]
    }
  };
  if (showStatus === 'hidden') {
    orderWhere['showStatus'] = 'normal';
  }

  try {
    // 查询该月每天的订单数据
    const orderCharts = await Order.findAll({
      where: orderWhere,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%d'), 'day'],
        [sequelize.fn('SUM', sequelize.col('orderActualAmount')), 'amounts'],
        [sequelize.fn('SUM', sequelize.col('useBalance')), 'totalBalance'],
      ],
      group: ['day'],
      order: [['day', 'ASC']],
    });

    // 将查询结果转换为Map，方便后续处理
    const dailyDataMap = new Map();
    orderCharts.forEach(item => {
      const obj = item.toJSON();
      dailyDataMap.set(obj.day, Number(obj.amounts) + Number(obj.totalBalance));
      // dailyDataMap.set(obj.day, Number(obj.amounts));
    });

    // 获取该月的总天数
    const daysInMonth = dayjs(month).daysInMonth();
    
    // 生成完整的按天数据，没有数据的天数设置为0
    const outputData: { day: string, amounts: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0'); // 格式化为两位数字符串
      outputData.push({
        day: dayStr,
        amounts: dailyDataMap.get(dayStr) || 0,
      });
    }

    res.json(outputData);
  } catch (error) {
    logger.error('Error getting saler daily charts:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询店铺按天的营业额数据
export const getStoreDailyCharts = async (req: Request, res: Response) => {
  const month = req.query.month as string;
  const showStatus = req.query.showStatus as string;

  if (!month) {
    return res.status(400).json({ error: 'Month parameter is required' });
  }

  // 解析月份，获取该月的开始和结束时间
  const startTime = dayjs(month).startOf('month').toDate();
  const endTime = dayjs(month).endOf('month').toDate();

  // 根据showStatus查询订单
  const orderWhere = {
    createdAt: {
      [Op.between]: [startTime, endTime]
    },
    orderType: {
      [Op.eq]: 'normal',
    },
  };
  if (showStatus === 'hidden') {
    orderWhere['showStatus'] = 'normal';
  }

  try {
    // 查询该月每天的订单数据
    const orderCharts = await Order.findAll({
      where: orderWhere,
      attributes: [
        [sequelize.fn('DATE_FORMAT', sequelize.col('createdAt'), '%d'), 'day'],
        [sequelize.fn('SUM', sequelize.col('orderActualAmount')), 'amounts'],
        [sequelize.fn('SUM', sequelize.col('useBalance')), 'totalBalance'],
      ],
      group: ['day'],
      order: [['day', 'ASC']],
    });

    // 将查询结果转换为Map，方便后续处理
    const dailyDataMap = new Map();
    orderCharts.forEach(item => {
      const obj = item.toJSON();
      dailyDataMap.set(obj.day, Number(obj.amounts) + Number(obj.totalBalance));
    });

    // 查询符合条件的订单
    const orders = await Order.findAll({
      where: orderWhere,
    });

    // 查询符合条件的订单商品
    const orderList = orders.map(item => item.toJSON());
    const orderItemsResult = await findAllByInChunks(
      OrderItems,
      'orderSn',
      orderList.map(item => item.orderSn),
    );

    // 查询符合条件的订单商品的进货价
    const orderItems = (orderItemsResult as any[]).map(item => item.toJSON());
    const inventoryList = await findAllByInChunks(
      Inventory,
      'sku',
      orderItems.map(item => item.sku),
    );
    
    // 将商品进货价转换为map
    const inventoryMap = new Map(
      (inventoryList as any[]).map(item => {
        const data = item.toJSON();
        return [data.sku, data];
      })
    );

    // 订单按天统计这些订单中商品的总进货价
    // 1. 构建订单号到天的映射
    const orderSnToDay = new Map<string, string>();
    orders.forEach(item => {
      const day = dayjs(item.get('createdAt') as string).format('DD');
      orderSnToDay.set(item.get('orderSn') as string, day);
    });

    // 2. 统计每天进货价
    const dayCostMap = new Map<string, number>();
    orderItems.forEach(item => {
      const day = orderSnToDay.get(item.orderSn);
      const inventory = inventoryMap.get(item.sku);
      const costPrice = inventory ? Number(inventory.costPrice) : 0;
      const totalCost = costPrice * item.counts;
      if (day) {
        dayCostMap.set(day, Number(((dayCostMap.get(day) || 0) + totalCost).toFixed(2)));
      }
    });

    // 获取该月的总天数
    const daysInMonth = dayjs(month).daysInMonth();
    
    // 生成完整的按天数据，没有数据的天数设置为0
    const outputData: { day: string, amounts: number, cost: number }[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dayStr = day.toString().padStart(2, '0'); // 格式化为两位数字符串
      outputData.push({
        day: dayStr,
        amounts: dailyDataMap.get(dayStr) || 0,
        cost: dayCostMap.get(dayStr) || 0
      });
    }

    res.json(outputData);
  } catch (error) {
    logger.error('Error getting store daily charts:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};