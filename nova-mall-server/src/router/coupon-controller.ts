import { Request, Response } from 'express';
import { Op } from 'sequelize';
import dayjs from 'dayjs';
import logger from '../logger';
import { Member } from '../model/member';
import { MemberCoupon } from '../model/memberCoupon';

// 根据会员查询用户的优惠券列表
export const queryMemberCouponList = async (req: Request, res: Response) => {
  const { phone, expiredTime } = req.query;
  try {
    const resultCheckExists = await Member.findOne({
      where: {
        phone,
      },
    });
    if (resultCheckExists) {
      const where = {} as Record<string, unknown>;
      where['phone'] = phone;
      if (expiredTime) {
        where['couponExpiredTime'] = { [Op.gte]: dayjs().toDate() };
      }
      const { count, rows } = await MemberCoupon.findAndCountAll({
        where,
        order: [['createdAt', 'DESC']],
      });
      res.json({
        count: count || 0,
        data: rows || [],
      });
    } else {
      res.json({ error: 'Member not found' });
    }
  } catch (error) {
    logger.error('Error querying Member Coupon List:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
