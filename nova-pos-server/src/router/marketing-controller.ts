import { Request, Response } from 'express';
import { Op } from 'sequelize';
import logger from '../logger';
import { Marketing } from '../model/marketing';
import { StoreCoupon } from '../model/storeCoupon';
import dayjs from 'dayjs';

// 获取营销活动列表
export const getMarketingList = async (req: Request, res: Response) => {
  const { marketingName, marketingType, startDate, endDate, pageSize, current } = req.query;
  const limit = Number(pageSize);
  const offset = (Number(current) - 1) * limit;
  const where = {};

  if (marketingName) {
    where['marketingName'] = {
      [Op.substring]: marketingName,
    };
  }
  if (marketingType) {
    where['marketingType'] = {
      [Op.substring]: marketingType,
    };
  }

  // 处理起止时间：活动周期与筛选区间有重叠即命中
  if (startDate && endDate) {
    const start = dayjs(startDate as string).startOf('day').toDate();
    const end = dayjs(endDate as string).endOf('day').toDate();

    where['startTime'] = {
      [Op.lte]: end,
    };
    where['endTime'] = {
      [Op.gte]: start,
    };
  }
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
    logger.error('Error getting Marketing List:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 创建营销活动
export const createMarketing = async (req: Request, res: Response) => {
  const { marketingName, marketingType, marketingDesc, startTime, endTime, marketingContent, marketingTheme, marketingImage } = req.body;
  const { full, reduce } = marketingContent;
  try {
    const marketing = await Marketing.create({
      marketingName,
      marketingDesc,
      marketingType,
      marketingTheme,
      marketingImage,
      marketingCondition: full || 0, // 仅限满送活动有值写入
      marketingValue: reduce || 0, // 仅限满送活动有值写入
      startTime,
      endTime,
    });
    // 根据活动类型，创建活动内容
    if (marketingType === 'full_send') { // 满送活动
      const { distributionRules } = marketingContent;
      // 将满送的优惠券写入店铺优惠券表
      for (const rule of distributionRules) {
        const { full, reduce, count } = rule;
        await StoreCoupon.create({
          activityId: (marketing as any).id,
          couponDesc: `满${full}元减${reduce}元`,
          couponCondition: full,
          couponValue: reduce,
          couponStatus: 'active',
          couponExpiredTime: dayjs(endTime).add(1, 'year').toDate(), // 活动结束时间延长1年
          couponCount: count,
        });
      }
    } else if (marketingType === 'full_reduce') { // 满减活动
      const { rules } = marketingContent;
      // 将满减的优惠券写入店铺优惠券表
      for (const rule of rules) {
        const { full, reduce } = rule;
        await StoreCoupon.create({
          activityId: (marketing as any).id,
          couponDesc: `满${full}元减${reduce}元`,
          couponCondition: full,
          couponValue: reduce,
          couponStatus: 'active',
          couponExpiredTime: endTime, // 满减活动的优惠券，有效期就是活动结束时间
          couponCount: 1,
        });
      }
    } else if (marketingType === 'full_gift') { // 满赠活动
      // 将满赠的优惠券写入店铺优惠券表
      // 暂不实现
    }
    res.json(marketing);
  } catch (error) {
    logger.error('Error creating Marketing:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 更新营销活动
export const updateMarketing = async (req: Request, res: Response) => {
  const { id } = req.query;
  const { marketingName, startTime, endTime, marketingDesc, marketingTheme, marketingImage } = req.body;
  try {
    const marketing = await Marketing.findByPk(id as string);
    if (marketing) {
      await marketing.update({
        marketingName: marketingName,
        startTime,
        endTime,
        marketingDesc: marketingDesc,
        marketingTheme,
        marketingImage,
      });
      res.json(marketing);
    } else {
      res.status(404).json({ error: 'Marketing not found' });
    }
  } catch (error) {
    logger.error('Error updating Marketing:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 删除营销活动
export const deleteMarketing = async (req: Request, res: Response) => {
  const { id } = req.body;
  try {
    const marketing = await Marketing.findByPk(id as string);
    if (marketing) {
      await marketing.destroy();
      // 删除营销活动下属优惠券
      await StoreCoupon.destroy({
        where: {
          activityId: id,
        },
      });
      res.json({ message: 'Marketing deleted successfully' });
    } else {
      res.status(404).json({ error: 'Marketing not found' });
    }
  } catch (error) {
    logger.error('Error deleting Marketing:');
    console.log(error);
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
    logger.error('Error getting Marketing Detail:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 获取营销活动下属优惠券列表
export const getMarketingCouponList = async (req: Request, res: Response) => {
  const { id } = req.query;
  const { count, rows } = await StoreCoupon.findAndCountAll({
    where: {
      activityId: id,
    },
  });
  res.json({
    count: count || 0,
    data: rows || [],
  });
};

// 下线营销活动
export const offlineMarketing = async (req: Request, res: Response) => {
  const { id } = req.body;
  try {
    const marketing = await Marketing.findByPk(id as string);
    if (marketing) {
      await marketing.update({
        endTime: dayjs().toDate(),
      });
      // 营销活动下属优惠券全部设置过期掉
      await StoreCoupon.update({
        couponStatus: 'invalid',
        couponExpiredTime: dayjs().toDate(),
      }, {
        where: {
          activityId: id,
        },
      });
      res.json({ message: 'Marketing offline successfully' });
    } else {
      res.status(404).json({ error: 'Marketing not found' });
    }
  } catch (error) {
    logger.error('Error offline Marketing:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
