import { Request, Response } from 'express';
import logger from '../logger';
import { Member } from '../model/member';
import { MemberBalance } from '../model/memberBalance';

// 根据会员查询用户的余额列表
export const queryMemberBalanceList = async (req: Request, res: Response) => {
  const { phone } = req.query;
  try {
    const resultCheckExists = await Member.findOne({
      where: {
        phone,
      },
    });
    if (resultCheckExists) {
      // 从用户积分表取数据
      const { count, rows } = await MemberBalance.findAndCountAll({
        where: { phone },
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
    logger.error('Error querying Member Balance List:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
