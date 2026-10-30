import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import os from 'os';
import logger from '../logger';
import dayjs from 'dayjs';

import Sequelize, { Op } from 'sequelize';
import { OpLog } from '../model/opLog';
import { User } from '../model/user';
import { resolvePagination } from '../utils/query';

// Configure multer for Excel file upload in temp directory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, os.tmpdir()); // Use system temp directory
  },
  filename: (req, file, cb) => {
    cb(null, `excel-${Date.now()}${path.extname(file.originalname)}`);
  },
});

const excelFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext !== '.xlsx' && ext !== '.xls') {
    return cb(new Error('只允许上传 Excel 文件 (.xlsx 或 .xls)'));
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter: excelFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制文件大小为 5MB
  },
}).single('file');

interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

// 上传文件（批量入库，导入订单）
export const uploadFile = (req: RequestWithFile, res: Response, next: NextFunction): void => {
  upload(req as any, res as any, async (err: any) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ 
        success: false,
        error: '文件上传失败',
        details: err.message 
      });
    } else if (err) {
      return res.status(400).json({ 
        success: false,
        error: err.message 
      });
    }

    try {
      if (!req.file) {
        return res.status(400).json({ 
          success: false,
          error: '没有上传文件' 
        });
      }

      // Read and parse Excel file
      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON array
      const data = XLSX.utils.sheet_to_json(worksheet, {
        raw: false, // Convert all numbers to strings
        defval: '', // Default value for empty cells
      });

      // Return parsed data
      res.json({
        success: true,
        data,
        total: data.length,
        message: 'Excel文件解析成功'
      });

    } catch (error) {
      logger.error('Excel文件处理错误:', error);
      res.status(500).json({ 
        success: false,
        error: 'Excel文件处理失败',
        details: error instanceof Error ? error.message : '未知错误'
      });
    }
  });
};

export const opLogs = async (req: Request, res: Response) => {
  const { start, end, type, pageSize, current } = req.query;
  const { limit, offset } = resolvePagination(req.query);

  const startTime = dayjs(start as string).startOf('day').toDate();
  const endTime = dayjs(end as string).endOf('day').toDate();

  const where = {
    createdAt: {
      [Op.gte]: startTime,
      [Op.lte]: endTime,
    },
  };

  if (type) {
    where['type'] = {
      [Op.eq]: type,
    };
  }

  try {
    const { count, rows } = await OpLog.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    // 操作日志只落 userId，列表要展示姓名：按本页 userId 批量补一次用户名
    const userIds = [...new Set(rows.map((row: any) => row.userId).filter(Boolean))].map(String);
    const users = userIds.length
      ? await User.findAll({ where: { id: { [Op.in]: userIds } } })
      : [];
    const nameMap = new Map<string, string>(
      users.map((user: any) => {
        const json = user.toJSON();
        return [String(json.id), String(json.realName || json.name || '')];
      }),
    );

    res.json({
      count: count || 0,
      data: rows.map((row: any) => {
        const json = row.toJSON();
        return {
          ...json,
          userName: json.userId ? nameMap.get(String(json.userId)) ?? null : null,
        };
      }),
    });
  } catch (error) {
    logger.error('Error getting OpLog by date:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
