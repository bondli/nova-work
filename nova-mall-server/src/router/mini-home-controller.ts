import dayjs from 'dayjs';
import { Op } from 'sequelize';
import { getMiniConfig } from '../config';
import { Marketing } from '../model/marketing';
import type { Request, Response } from 'express';
import { handle } from '../utils/async-handler';
import { resolvePagination } from '../utils/query';
import { readSharedMiniHome } from '../service/mini-home-content';

/** 首页：门店优先读共享配置里的 store，其次回退 mall-config；素材缺失回退默认配置 */
export const getMiniHome = handle(async (_req: Request, res: Response) => {
  const { store: configStore, miniHome } = getMiniConfig();
  const shared = readSharedMiniHome();
  const content = shared ?? miniHome;
  res.json({
    success: true,
    data: {
      // 素材地址由桌面端写入绝对 URL，这里原样返回
      store: shared?.store ?? configStore,
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
  res.json({ success: true, data: content?.store ?? getMiniConfig().store });
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
    data: rows.map((row) => row.get({ plain: true }) as Record<string, unknown>),
    count,
  });
});
