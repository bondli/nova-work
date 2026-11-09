import fs from 'fs';
import path from 'path';

import { Request, Response } from 'express';
import multer from 'multer';
import { Op } from 'sequelize';
import ExcelJS from 'exceljs';

import logger from '../logger';
import { getUploadDir, getUploadToken } from '../config';
import { Inventory } from '../model/inventory';
import { InventoryRecord } from '../model/inventoryRecord';

import oplog from '../service/oplog';
import { resolvePagination, resolveOrderBy } from '../utils/query';

type RequestWithFile = Request & {
  file?: Express.Multer.File;
};

const safeSnPattern = /^[A-Za-z0-9_-]+$/;

const inventoryImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/jpg'].includes(file.mimetype)) {
      cb(new Error('只允许上传 jpg/jpeg 图片'));
      return;
    }
    cb(null, true);
  },
}).single('file');

const getTokenFromQuery = (token: unknown): string => {
  if (Array.isArray(token)) {
    return String(token[0] || '');
  }
  return typeof token === 'string' ? token : '';
};

/** 校验 JPEG 文件头，防止伪造 Content-Type 上传非图片内容 */
const isJpegBuffer = (buffer: Buffer): boolean =>
  buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

// 上传商品图片由插件调用：优先读 x-upload-token 请求头，兼容旧的 URL 参数契约
export const uploadInventoryImage = (req: RequestWithFile, res: Response): void => {
  const headerToken = String(req.get('x-upload-token') ?? '').trim();
  const requestToken = headerToken || getTokenFromQuery(req.query.token);
  const expectedToken = getUploadToken();

  if (!expectedToken || !requestToken || requestToken !== expectedToken) {
    res.status(401).json({
      success: false,
      error: '图片上传 token 无效',
    });
    return;
  }

  inventoryImageUpload(req as Request, res, async (err: unknown) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({
        success: false,
        error: '图片上传失败',
        details: err.message,
      });
      return;
    }

    if (err instanceof Error) {
      res.status(400).json({
        success: false,
        error: err.message,
      });
      return;
    }

    try {
      const sn = String(req.body?.sn || '').trim();

      if (!sn) {
        res.status(400).json({
          success: false,
          error: '缺少商品货号',
        });
        return;
      }

      if (!safeSnPattern.test(sn)) {
        res.status(400).json({
          success: false,
          error: '商品货号包含非法字符',
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          error: '没有上传图片',
        });
        return;
      }

      if (!isJpegBuffer(req.file.buffer)) {
        res.status(400).json({
          success: false,
          error: '不是有效的 JPEG 图片',
        });
        return;
      }

      const imageDir = getUploadDir();
      await fs.promises.mkdir(imageDir, { recursive: true });

      const filename = `${sn}.jpg`;
      const imagePath = path.join(imageDir, filename);
      await fs.promises.writeFile(imagePath, req.file.buffer);

      // 品名是款号维度共享字段：采集时若带了品名，同步更新该款号下所有 SKU
      const name = String(req.body?.name ?? '').trim();
      let updated: number | null = null;
      if (name) {
        [updated] = await Inventory.update({ name }, { where: { sn } });
      }

      res.json({
        success: true,
        data: {
          sn,
          name: name || null,
          updated,
          imageUrl: `/inventory-image/${filename}`,
          filename,
        },
      });
    } catch (error) {
      logger.error('Error uploading inventory image:', error);
      res.status(500).json({
        success: false,
        error: '商品图片保存失败',
      });
    }
  });
};

// 查询所有库存的总量
export const queryInventoryTotal = async (req: Request, res: Response) => {
  try {
    const result = await Inventory.sum('counts');
    res.json({
      total: result || 0,
    });
  } catch (error) {
    logger.error('Error querying inventory total:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询库存概览：款式数、库存总量、累计销量与断码款数
export const queryInventorySummary = async (_req: Request, res: Response) => {
  try {
    const [styleCount, stockTotal, soldTotal, brokenStyleCount] = await Promise.all([
      Inventory.count({ distinct: true, col: 'sn' }),
      Inventory.sum('counts'),
      Inventory.sum('saleCounts'),
      Inventory.count({ distinct: true, col: 'sn', where: { counts: { [Op.lte]: 0 } } }),
    ]);
    res.json({
      styleCount: Number(styleCount || 0),
      stockTotal: Number(stockTotal || 0),
      soldTotal: Number(soldTotal || 0),
      brokenStyleCount: Number(brokenStyleCount || 0),
    });
  } catch (error) {
    logger.error('Error querying inventory summary:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 按款号展示所有的库存
export const queryInventoryList = async (req: Request, res: Response) => {
  const { sn, sku, name, keyword, brand, pageSize, current, orderby = '' } = req.query;
  const { limit, offset } = resolvePagination(req.query);
  const where = {};

  // 统一关键字：款号 / SKU / 品名任意命中
  if (keyword) {
    where[Op.or] = [
      { sn: { [Op.substring]: keyword } },
      { sku: { [Op.substring]: keyword } },
      { name: { [Op.substring]: keyword } },
    ];
  }

  if (sn) {
    where['sn'] = {
      [Op.substring]: sn,
    };
  }
  if (sku) {
    where['sku'] = {
      [Op.substring]: sku,
    };
  }
  if (name) {
    where['name'] = {
      [Op.substring]: name,
    };
  }
  if (brand) {
    where['brand'] = {
      [Op.substring]: brand,
    };
  }

  const orderByCondition = resolveOrderBy(orderby, [
    'createdAt',
    'updatedAt',
    'sn',
    'sku',
    'counts',
    'saleCounts',
    'name',
    'brand',
    'cost',
    'price1',
    'price2',
  ]);

  try {
    const { count, rows } = await Inventory.findAndCountAll({
      where,
      order: orderByCondition,
      limit,
      offset,
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting Inventory:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 根据款号查询所有的 SKU 列表
export const queryInventoryByStyle = async (req: Request, res: Response) => {
  const { sn } = req.query;
  try {
    const { count, rows } = await Inventory.findAndCountAll({
      where: { sn },
      order: [['createdAt', 'DESC']],
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting Inventory:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 更新一个 SKU 的信息
export const updateInventory = async (req: Request, res: Response) => {
  try {
    const { id } = req.query;
    const { sku, sn, name, color, size, brand, costPrice, originalPrice, counts } = req.body;
    const result = await Inventory.findOne({
      where: { sku },
    });
    if (result) {
      const oldCounts = result.get('counts');
      // await result.update({ sku, sn, name, color, size, brand, costPrice, originalPrice, counts });
      await result.update({ counts });
      const adjustCount = Number(counts) - Number(oldCounts);
      if (adjustCount !== 0) {
        await InventoryRecord.create({
          sku,
          type: 'adjust',
          info: `人工调整:${oldCounts} -> ${counts}`,
          count: adjustCount
        });
      }
      // 写入操作日志，记录关键的事件
      await oplog('modifyInventory', `SKU:${sku}, 数量:${oldCounts} -> ${counts}`);
      res.json(result.toJSON());
    } else {
      res.json({ error: 'Inventory not found' });
    }
  } catch (error) {
    logger.error('Error updating Inventory:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 根据 SKU 查询库存数量
export const queryDetailBySku = async (req: Request, res: Response) => {
  const { sku } = req.query;
  try {
    const result = await Inventory.findOne({
      where: { sku },
    });
    if (result) {
      res.json(result.toJSON());
    } else {
      res.json({ sku: null, msg: 'Inventory not found' });
    }
  } catch (error) {
    logger.error('Error getting Inventory:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询断码商品列表
export const queryNoStockList = async (req: Request, res: Response) => {
  const { pageSize, current, keyword } = req.query;
  const limit = Number(pageSize);
  const offset = (Number(current) - 1) * limit;
  const where: any = {
    counts: {
      [Op.lte]: 0,
    },
  };
  if (keyword) {
    where[Op.or] = [
      { sn: { [Op.substring]: keyword } },
      { sku: { [Op.substring]: keyword } },
      { name: { [Op.substring]: keyword } },
    ];
  }

  try {
    const { count, rows } = await Inventory.findAndCountAll({
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
    logger.error('Error getting no stock list:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询热销商品列表
export const queryHotSalesList = async (req: Request, res: Response) => {
  const { pageSize, current, minSaleCounts = 0, keyword } = req.query;
  const limit = Number(pageSize);
  const offset = (Number(current) - 1) * limit;
  const where: any = {
    saleCounts: {
      [Op.gte]: Number(minSaleCounts),
    },
  };
  if (keyword) {
    where[Op.or] = [
      { sn: { [Op.substring]: keyword } },
      { sku: { [Op.substring]: keyword } },
      { name: { [Op.substring]: keyword } },
    ];
  }

  try {
    const { count, rows } = await Inventory.findAndCountAll({
      where,
      order: [['saleCounts', 'DESC']],
      limit,
      offset,
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting hot sales list:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询商品流水
export const querySkuRecord = async (req: Request, res: Response) => {
  const { sku } = req.query;
  try {
    const { count, rows } = await InventoryRecord.findAndCountAll({
      where: {
        sku,
      },
      order: [['createdAt', 'DESC']],
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting sku record:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 查询全店最近出入库流水
export const queryInventoryRecords = async (req: Request, res: Response) => {
  const { pageSize = 100, current = 1 } = req.query;
  const limit = Number(pageSize);
  const offset = (Number(current) - 1) * limit;

  try {
    const { count, rows } = await InventoryRecord.findAndCountAll({
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });
    res.json({
      count: count || 0,
      data: rows || [],
    });
  } catch (error) {
    logger.error('Error getting inventory records:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 单个入库
export const createInventory = async (req: Request, res: Response) => {
  const { sn, sku, name, brand, color, size, originalPrice, costPrice, counts } = req.body;
  try {
    // 先判断该SKU是否已经存在
    const resultCheckExists = await Inventory.findOne({
      where: {
        sku,
      },
    });
    if (resultCheckExists === null) {
      const result = await Inventory.create({ sn, sku, name, brand, color, size, originalPrice, costPrice, counts });
      // 写入库存变动记录
      await InventoryRecord.create({ sku, type: 'in', info: `单品入库`, count: counts });
      res.status(200).json(result.toJSON());
    } else {
      res.json({ error: 'sku had exists' });
    }
  } catch (error) {
    logger.error('Error creating sku:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 批量处理预处理数据(入库)
export const batchProcessPurchaseData = async (req: Request, res: Response) => {
  const { dataList } = req.body;

  let totalCount = 0;

  // Excel 中相同条码可能出现在多行，先按条码合并、数量累加，
  // 避免后续批量入库时因唯一索引冲突报错
  const mergedMap = new Map<string, any>();
  for (const item of dataList) {
    const sku = item.条码;
    const counts = Number(item.出库数量 || item.数量) || 0;
    if (!item.品牌) {
      item.品牌 = '戴维贝拉';
    }
    if (mergedMap.has(sku)) {
      const existing = mergedMap.get(sku)!;
      existing.数量 = Number(existing.出库数量 || existing.数量) + counts;
      // 数量字段统一写回「数量」，出库数量留空，保证展示与提交一致
      delete existing.出库数量;
    } else {
      mergedMap.set(sku, { ...item });
    }
  }
  const mergedList = Array.from(mergedMap.values());

  // 收集所有需要查询的 sn 和 sku
  const sns = new Set<string>();
  const skus = new Set<string>();
  for (const item of mergedList) {
    totalCount += Number(item.出库数量 || item.数量) || 0;
    sns.add(item.商品 || item.货号);
    skus.add(item.条码);
  }

  // 一次性查询所有相关的库存记录
  const [snResults, skuResults] = await Promise.all([
    Inventory.findAll({
      where: {
        sn: {
          [Op.in]: Array.from(sns)
        }
      }
    }),
    Inventory.findAll({
      where: {
        sku: {
          [Op.in]: Array.from(skus)
        }
      }
    })
  ]);

  // 创建查询结果的 Map，方便快速查找
  const snMap = new Map(
    snResults.map(item => [(item as any).sn, item])
  );
  const skuMap = new Map(
    skuResults.map(item => [(item as any).sku, item])
  );

  // 处理每条数据
  for (const item of mergedList) {
    const sn = item.货号;
    const sku = item.条码;

    const snResult = snMap.get(sn);
    if (snResult) {
      const skuResult = skuMap.get(sku);
      if (skuResult) {
        item['type'] = 'addNum';
      } else {
        item['type'] = 'addSku';
      }
    } else {
      item['type'] = 'newStyle';
    }
  }

  res.json({
    success: true,
    dataList: mergedList,
    totalCount,
  });
};

// 批量入库
export const batchCreateInventory = async (req: Request, res: Response) => {
  const { dataList, billNo } = req.body;
  try {
    const results: Array<{
      sku: string;
      status: 'created' | 'updated';
      data: any;
    }> = [];
    const errors: Array<{
      sku: string;
      error: string;
    }> = [];

    // 定义一个变量来保存入库的总数和错误的数量
    let totalCount = 0;
    let errorCount = 0;

    // 用于批量插入流水
    const recordsToInsert: Array<{ sku: string; type: string; info: string; count: number }> = [];

    // 预处理数据，合并相同 SKU 的数量
    const skuMap = new Map<string, {
      counts: number;
      data: any;
    }>();

    for (const item of dataList) {
      const sku = item.条码;
      const counts = Number(item.出库数量 || item.数量);
      
      if (skuMap.has(sku)) {
        const existing = skuMap.get(sku)!;
        existing.counts += counts;
      } else {
        skuMap.set(sku, {
          counts,
          data: {
            name: item.小类 || item.品名,
            sn: item.商品 || item.货号,
            brand: item.品牌 || '戴维贝拉',
            sku: item.条码,
            size: item.尺码,
            color: item.颜色,
            originalPrice: item.吊牌价,
            costPrice: item.销售价 || item.进货价 || 0,
            counts
          }
        });
      }
    }

    // 获取所有需要查询的 SKU
    const skus = Array.from(skuMap.keys());
    
    // 一次性查询所有相关的库存记录
    const existingItems = await Inventory.findAll({
      where: {
        sku: {
          [Op.in]: skus
        }
      }
    });

    // 创建查询结果的 Map，方便快速查找
    const existingMap = new Map(
      existingItems.map(item => [(item as any).sku, item])
    );

    // 批量处理数据
    interface Operation {
      sku: string;
      promise: Promise<any>;
    }
    const updateOperations: Operation[] = [];
    const createOperations: Operation[] = [];

    for (const [sku, { counts, data }] of skuMap) {
      totalCount += counts;
      const existingItem = existingMap.get(sku);

      if (existingItem) {
        // SKU存在，更新库存数量
        const currentCounts = Number((existingItem as any).counts || 0);
        updateOperations.push({
          sku,
          promise: existingItem.update({
            counts: currentCounts + counts
          }).then(updatedItem => {
            results.push({
              sku,
              status: 'updated',
              data: updatedItem.toJSON()
            });
            // 记录流水
            recordsToInsert.push({
              sku,
              type: 'in',
              info: '批量入库',
              count: counts
            });
          }).catch(error => {
            errorCount += counts;
            errors.push({
              sku,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        });
      } else {
        // SKU不存在，创建新记录
        createOperations.push({
          sku,
          promise: Inventory.create(data).then(newItem => {
            results.push({
              sku,
              status: 'created',
              data: newItem.toJSON()
            });
            // 记录流水
            recordsToInsert.push({
              sku,
              type: 'in',
              info: '批量入库',
              count: counts
            });
          }).catch(error => {
            errorCount += counts;
            errors.push({
              sku,
              error: error instanceof Error ? error.message : String(error)
            });
          })
        });
      }
    }

    // 控制并发数量的函数
    const processBatch = async (operations: Operation[], batchSize: number = 10) => {
      const batches: Operation[][] = [];
      for (let i = 0; i < operations.length; i += batchSize) {
        batches.push(operations.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await Promise.all(batch.map(item => item.promise));
      }
    };

    // 分别处理更新和创建操作，每批最多10个并发
    await Promise.all([
      processBatch(updateOperations),
      processBatch(createOperations)
    ]);

    // 批量插入流水
    if (recordsToInsert.length > 0) {
      await InventoryRecord.bulkCreate(recordsToInsert);
    }

    // 写入操作日志，记录关键的事件
    await oplog('purchaseInventory', `批量入库，单号：${billNo}，总数量：${totalCount}，错误数量：${errorCount}`);

    res.json({
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      totalCount,
      errorCount
    });
  } catch (error) {
    logger.error('Error in batch creating inventory:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 批量处理预处理数据(退库)
export const batchProcessReturnsData = async (req: Request, res: Response) => {
  const { dataList } = req.body;

  let totalCount = 0;
  // 对传入的数据进行遍历，将重复的行合并，数量列相加
  interface ReturnItem {
    sku: string;
    returnCounts: string | number;
    [key: string]: any;  // 允许其他可能的字段
  }
  const newDataList: ReturnItem[] = [];
  const map = new Map<string, ReturnItem>();
  for (const item of dataList) {
    const sku = item.条码;
    if (map.has(sku)) {
      const data = map.get(sku)!;
      data.returnCounts = Number(data.returnCounts) + Number(item.数量);
    } else {  
      map.set(sku, {
        sku,
        returnCounts: Number(item.数量),
      });
    }
  }
  for (const item of map.values()) {
    newDataList.push(item);
  }
  
  // 获取所有需要查询的 SKU
  const skus = newDataList.map(item => item.sku);
  
  // 一次性查询所有相关的库存记录
  const inventoryItems = await Inventory.findAll({
    where: {
      sku: {
        [Op.in]: skus
      }
    }
  });

  // 创建一个 Map 来存储查询结果，方便快速查找
  const inventoryMap = new Map(
    inventoryItems.map(item => [(item as any).sku, item.toJSON()])
  );

  // 最后将记录返回
  interface FinalReturnItem extends ReturnItem {
    id?: number;
    name?: string;
    brand?: string;
    color?: string;
    size?: string;
    originalPrice?: number;
    costPrice?: number;
    counts?: number;
    createdAt?: Date;
    updatedAt?: Date;
  }
  const finalDataList: FinalReturnItem[] = [];

  for (const item of newDataList) {
    totalCount += Number(item.returnCounts);
    const inventoryData = inventoryMap.get(item.sku);
    
    if (inventoryData) {
      finalDataList.push({
        ...(inventoryData as unknown as FinalReturnItem),
        sku: item.sku,
        returnCounts: Number(item.returnCounts),
      } as FinalReturnItem);
    }
  }

  res.json({
    success: true,
    dataList: finalDataList,
    totalCount,
  });
};

// 批量退库
export const batchReturnsInventory = async (req: Request, res: Response) => {
  const { dataList, billNo } = req.body;
  let errorCount = 0;
  let totalCount = 0;

  try {
    // 获取所有需要处理的 SKU
    const skus = dataList.map(item => item.sku);
    
    // 一次性查询所有相关的库存记录
    const inventoryItems = await Inventory.findAll({
      where: {
        sku: {
          [Op.in]: skus
        }
      }
    });

    // 创建一个 Map 来存储查询结果，方便快速查找
    const inventoryMap = new Map(
      inventoryItems.map(item => [(item as any).sku, item])
    );

    // 创建一个 Map 来存储每个 SKU 的退货数量
    const returnCountsMap = new Map<string, number>();
    dataList.forEach(item => {
      const currentCount = returnCountsMap.get(item.sku) || 0;
      returnCountsMap.set(item.sku, currentCount + Number(item.returnCounts));
    });

    // 批量更新库存并收集流水
    const updatePromises: Promise<any>[] = [];
    const recordsToInsert: Array<{ sku: string; type: string; info: string; count: number }> = [];
    for (const [sku, returnCounts] of returnCountsMap) {
      totalCount += returnCounts;
      const inventoryItem = inventoryMap.get(sku);
      
      if (inventoryItem) {
        updatePromises.push(
          inventoryItem.decrement('counts', { by: returnCounts })
        );
        recordsToInsert.push({
          sku,
          type: 'return',
          info: '批量退库',
          count: returnCounts
        });
      } else {
        errorCount += returnCounts;
      }
    }

    // 等待所有更新操作完成
    await Promise.all(updatePromises);
    // 批量插入流水
    if (recordsToInsert.length > 0) {
      await InventoryRecord.bulkCreate(recordsToInsert);
    }

    // 写入操作日志，记录关键的事件
    await oplog('returnInventory', `批量退库，单号：${billNo}，总数量：${totalCount}，错误数量：${errorCount}`);

    res.json({
      success: true,
      errorCount,
      totalCount,
    });
  } catch (error) {
    logger.error('Error in batch returns inventory:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 下载模板
export const downloadTemplate = async (req: Request, res: Response) => {
  const { type } = req.body;
  let fileName = '';

  // 将结果写入excel文件
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('default');

  try {
    if (type === 'purchase') {
      fileName = 'purchase.xlsx';
      worksheet.addRow(['品名', '货号', '条码', '尺码', '颜色', '吊牌价', '进货价', '数量', '品牌']);
    }
    else {
      fileName = 'returns.xlsx';
      worksheet.addRow(['条码', '数量']);
    }
    
    // 将文件写入响应
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    workbook.xlsx.write(res);
  } catch (error) {
    logger.error('Error downloading template:');
    console.log(error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
