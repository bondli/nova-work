import { Request, Response } from 'express';
import logger from '../logger';
import { Member } from '../model/member';
import { MemberScore } from '../model/memberScore';

// 根据会员查询用户的积分列表
export const queryMemberScoreList = async (req: Request, res: Response) => {
  const { phone } = req.query;
  try {
    const resultCheckExists = await Member.findOne({
      where: {
        phone,
      },
    });
    if (resultCheckExists) {
      // 从用户积分表取数据
      const { count, rows } = await MemberScore.findAndCountAll({
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
    logger.error('Error querying Member Score List:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
