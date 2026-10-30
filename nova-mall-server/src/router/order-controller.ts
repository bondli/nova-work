import { Request, Response } from 'express';
import { Op } from 'sequelize';
import logger from '../logger';
import { Order } from '../model/order';
import { OrderItems } from '../model/orderItems';
import { Inventory } from '../model/inventory';

// 查询订单列表
export const queryOrderList = async (req: Request, res: Response) => {
  const { phone, pageSize = 100, current = 1 } = req.query;
  const limit = Number(pageSize);
  const offset = (Number(current) - 1) * limit;

  const where = {} as Record<string, unknown>;

  if (phone) {
    where['userPhone'] = {
      [Op.eq]: phone,
    };
    where['orderType'] = {
      [Op.eq]: 'normal',
    };
  } else {
    res.status(500).json({ error: '缺少用户手机号' });
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
    logger.error('Error querying Order List:', error);
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
    logger.error('Error getting Order Detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询订单中的商品列表
export const queryOrderItemList = async (req: Request, res: Response) => {
  const { orderSn } = req.query;

  const where = {} as Record<string, unknown>;

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
    logger.error('Error querying Order Item List:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
