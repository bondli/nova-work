import dayjs from 'dayjs';
import { Op } from 'sequelize';
import { getMiniConfig } from '../config';
import { Marketing } from '../model/marketing';
import type { Request, Response } from 'express';
import { handle } from '../utils/async-handler';
import { resolvePagination } from '../utils/query';
import { readSharedMiniHome } from '../service/mini-home-content';
import {
  rewriteMiniHomeContent,
  rewriteMiniStore,
  toMiniAssetUrl,
} from '../service/mini-assets';

/** 首页：门店优先读共享配置里的 store，其次回退 mall-config；素材缺失回退默认配置 */
export const getMiniHome = handle(async (_req: Request, res: Response) => {
  const { store: configStore, miniHome } = getMiniConfig();
  const shared = readSharedMiniHome();
  const content = rewriteMiniHomeContent(shared ?? miniHome);
  res.json({
    success: true,
    data: {
      // 图片统一走 mall 自己的域名，不对外暴露 POS 服务地址
      store: rewriteMiniStore(shared?.store ?? configStore),
      brand: content.brand,
      banners: content.banners,
      categories: content.categories,
      brandStory: content.brandStory,
      products: content.products,
      // 点击配置仅来自桌面端共享配置；旧配置或回退默认时关闭点击
      productDetail: shared?.productDetail ?? { enabled: false, path: '/pages/product/index' },
    },
  });
});

/** 门店信息（首页与「我的」共用）：与首页保持同一数据源 */
export const getMiniStore = handle(async (_req: Request, res: Response) => {
  const content = readSharedMiniHome();
  res.json({ success: true, data: rewriteMiniStore(content?.store ?? getMiniConfig().store) });
});

/** 进行中的营销活动；字段原样返回，默认每页 20 条 */
export const getMiniMarketings = handle(async (req: Request, res: Response) => {
  const { limit, offset } = resolvePagination(req.query as Record<string, unknown>);

  const { count, rows } = await Marketing.findAndCountAll({
    where: { endTime: { [Op.gt]: dayjs().toDate() } },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
  });

  res.json({
    success: true,
    data: rows.map((row) => {
      // Sequelize 实例转纯对象，活动封面图改写成 mall 域名下的静态地址
      const plain = row.get({ plain: true }) as Record<string, unknown>;
      if (typeof plain.marketingImage === 'string') {
        plain.marketingImage = toMiniAssetUrl(plain.marketingImage);
      }
      return plain;
    }),
    count,
  });
});
