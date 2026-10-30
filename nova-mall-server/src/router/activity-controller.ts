import { Request, Response } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import logger from '../logger';
import { Marketing } from '../model/marketing';

// 获取营销活动列表
export const getMarketingList = async (req: Request, res: Response) => {
  const { pageSize = 100, current = 1 } = req.query;
  const limit = Number(pageSize);
  const offset = (Number(current) - 1) * limit;
  const where = {
    endTime: { [Op.gt]: dayjs() },
  };

  try {
    const { count, rows } = await Marketing.findAndCountAll({
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
    logger.error('Error getting Marketing List:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 获取营销活动详情
export const getMarketingDetail = async (req: Request, res: Response) => {
  const { id } = req.query;
  try {
    const marketing = await Marketing.findByPk(id as string);
    res.json(marketing);
  } catch (error) {
    logger.error('Error getting Marketing Detail:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
