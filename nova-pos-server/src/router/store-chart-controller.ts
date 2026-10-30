import { Request, Response } from 'express';
import logger from '../logger';
import { getStoreCharts, archiveMonthData } from '../service/storeChartService';

// 获取店铺营业额图表数据
export const getStoreChartsHandler = async (req: Request, res: Response) => {
  try {
    const data = await getStoreCharts();
    res.json(data);
  } catch (error) {
    logger.error('Error getting store charts:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
};

// 归档指定月份数据
export const archiveMonthDataHandler = async (req: Request, res: Response) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ code: 400, message: 'year and month are required' });
    }

    const yearNum = parseInt(year as string, 10);
    const monthNum = parseInt(month as string, 10);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ code: 400, message: 'invalid year or month' });
    }

    const result = await archiveMonthData(yearNum, monthNum);

    if (!result.success) {
      return res.json({ code: 1, message: result.message });
    }

    res.json({ code: 0, message: result.message });
  } catch (error) {
    logger.error('Error archiving month data:', error);
    res.status(500).json({ code: 500, message: 'Internal server error' });
  }
};
