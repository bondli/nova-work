import type { Request, Response } from 'express';
import { Inventory } from '../model/inventory';
import { readSharedMiniHome } from '../service/mini-home-content';
import { handle } from '../utils/async-handler';

/**
 * 小程序商品详情：按款号（Inventory.sn）查询 SKU 列表。
 * 主图 / 详描图 / 价格取首页配置中同一款号的商品，旧配置缺失时用库存信息兜底。
 */
export const getMiniProduct = handle(async (req: Request, res: Response) => {
  const sn = String(req.params.sn ?? '').trim();
  if (!sn) {
    res.status(400).json({ success: false, code: 'BAD_REQUEST', message: '款号不能为空' });
    return;
  }

  const content = readSharedMiniHome();
  const product = content?.products.find((item) => (item.sn ?? '') === sn);

  const rows = await Inventory.findAll({
    where: { sn },
    order: [
      ['color', 'ASC'],
      ['size', 'ASC'],
    ],
  });

  if (!product && rows.length === 0) {
    res.status(404).json({ success: false, code: 'NOT_FOUND', message: '未找到该商品' });
    return;
  }

  const first = rows[0];
  const fallbackPrice = first ? `¥${Number(first.get('originalPrice') ?? 0)}` : '';

  res.json({
    success: true,
    data: {
      sn,
      name: product?.name || ((first?.get('name') as string) ?? ''),
      brand: (first?.get('brand') as string) ?? '',
      price: product?.price || fallbackPrice,
      originPrice: product?.originPrice || '',
      image: product?.image ?? '',
      detailImages: product?.detailImages ?? [],
      skus: rows.map((row) => ({
        sku: row.get('sku') as string,
        color: (row.get('color') as string) ?? '',
        size: (row.get('size') as string) ?? '',
        stock: Number(row.get('counts') ?? 0),
        originalPrice: Number(row.get('originalPrice') ?? 0),
      })),
    },
  });
});
