/**
 * 小程序首页素材配置。
 * 桌面端「营销 - 小程序基础信息 / 小程序 banner / 小程序新品」编辑后写入 `~/.nova/mini-content.json`，
 * 该文件同时被 nova-mall-server 的 `/mini/home` 读取，作为小程序首页唯一内容来源。
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { NOVA_HOME } from '../config';

export const MINI_HOME_CONTENT_FILE = path.join(NOVA_HOME, 'mini-content.json');

export interface MiniHomeBanner {
  tag: string;
  title: string;
  desc: string;
  cta: string;
  image: string;
  /** 小程序页面路径，留空时客户端只提示活动信息 */
  link: string;
}

export interface MiniHomeCategory {
  name: string;
  size: string;
  image: string;
}

export interface MiniHomeBrandStory {
  title: string;
  slogan: string;
  desc: string;
  images: string[];
  stats: Array<{ value: string; label: string }>;
}

export interface MiniHomeProduct {
  tag: string;
  name: string;
  desc: string;
  price: string;
  originPrice: string;
  image: string;
  /** 关联库存款号（Inventory.sn），商详页据此查询 SKU 列表 */
  sn: string;
  /** 商详页详描图，留空时商详页仅展示主图 */
  detailImages: string[];
}

/** 首页「本季新品」点击行为：开关 + 小程序商详页路径 */
export interface MiniHomeProductDetail {
  enabled: boolean;
  path: string;
}

/** 门店信息：首页「到店体验」与「我的-门店信息」共用同一份数据 */
export interface MiniHomeStore {
  name: string;
  address: string;
  hours: string;
  phone: string;
  lat: number;
  lng: number;
  image: string;
}

export interface MiniHomeContent {
  brand: { name: string; sublabel: string };
  banners: MiniHomeBanner[];
  categories: MiniHomeCategory[];
  brandStory: MiniHomeBrandStory;
  products: MiniHomeProduct[];
  productDetail: MiniHomeProductDetail;
  store: MiniHomeStore;
}

/** 首次读取时的兜底内容，与 nova-mall-server 内置默认值保持一致 */
export const DEFAULT_MINI_HOME: MiniHomeContent = {
  brand: { name: 'Dave & Bella', sublabel: 'DAVE & BELLA · KIDS 0-14' },
  banners: [
    {
      tag: '秋冬新品',
      title: '秋冬焕新 满 1000 减 150',
      desc: '全场童装通用 · 到店即享',
      cta: '查看活动',
      image: '',
      link: '',
    },
    {
      tag: '积分兑换',
      title: '积分兑好礼 到店自提',
      desc: '保温杯 / 浴巾 / 帆布包 限量上新',
      cta: '去兑换',
      image: '',
      link: '/pages/redeem/index',
    },
    {
      tag: '会员日',
      title: '会员日 双倍积分',
      desc: '每月 8 日会员消费双倍积分',
      cta: '了解会员',
      image: '',
      link: '/pages/mine/index',
    },
  ],
  categories: [
    { name: '女小童', size: '73-150cm', image: '' },
    { name: '男小童', size: '73-150cm', image: '' },
    { name: '女大童', size: '110-160cm', image: '' },
    { name: '男大童', size: '110-160cm', image: '' },
    { name: '婴儿', size: '0-1 岁', image: '' },
    { name: '童鞋', size: '0-13 岁', image: '' },
  ],
  brandStory: {
    title: 'ABOUT DAVE&BELLA',
    slogan: '因爱而生　为爱创造',
    desc:
      '2011 年创立，专注 0-14 岁儿童服饰。坚持以 A 类婴幼儿标准做贴身衣物，用柔软面料与原创设计，陪伴超过 3000 万家庭的孩子长大。',
    images: [''],
    stats: [
      { value: '3000万+', label: '家庭选择' },
      { value: 'A 类', label: '婴幼儿标准' },
      { value: '0-14 岁', label: '全龄段覆盖' },
    ],
  },
  products: [
    {
      tag: '本季新品',
      name: '奶油针织开衫',
      desc: 'A 类棉 · 珍珠扣',
      price: '¥399',
      originPrice: '¥499',
      image: '',
      sn: '',
      detailImages: [],
    },
    {
      tag: '热销',
      name: '轻盈羽绒马甲',
      desc: '90% 白鸭绒 · 轻暖',
      price: '¥459',
      originPrice: '¥599',
      image: '',
      sn: '',
      detailImages: [],
    },
    {
      tag: '人气',
      name: '纯棉背带裤',
      desc: 'A 类婴幼儿标准',
      price: '¥269',
      originPrice: '¥329',
      image: '',
      sn: '',
      detailImages: [],
    },
    {
      tag: '新品',
      name: '软底学步鞋',
      desc: '防滑耐磨 · 0-3 岁',
      price: '¥299',
      originPrice: '¥369',
      image: '',
      sn: '',
      detailImages: [],
    },
  ],
  productDetail: {
    enabled: false,
    path: '/pages/product/index',
  },
  store: {
    name: 'DaveBella 童装生活馆',
    address: '杭州市 · 万象城 L3 · 儿童区',
    hours: '10:00 - 22:00 · 周一至周日',
    phone: '0571-8888 6666',
    lat: 30.2525,
    lng: 120.1644,
    image: '',
  },
};

const bannerSchema = z.object({
  tag: z.string().max(20),
  title: z.string().max(60),
  desc: z.string().max(100),
  cta: z.string().max(20),
  image: z.string().max(500),
  link: z.string().max(200),
});

const categorySchema = z.object({
  name: z.string().max(20),
  size: z.string().max(20),
  image: z.string().max(500),
});

const productSchema = z.object({
  tag: z.string().max(20),
  name: z.string().max(40),
  desc: z.string().max(60),
  price: z.string().max(20),
  originPrice: z.string().max(20),
  image: z.string().max(500),
  // 历史配置文件没有这两个字段，缺省补空值，避免整份配置被判为非法
  sn: z.string().max(40).default(''),
  detailImages: z.array(z.string().max(500)).max(3).default([]),
});

const storeSchema = z.object({
  name: z.string().max(40),
  address: z.string().max(100),
  hours: z.string().max(60),
  phone: z.string().max(30),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  image: z.string().max(500),
});

/** 保存时强校验：字段完整、数量上限与文案长度都收口在这里，避免小程序被脏数据撑坏 */
export const miniHomeContentSchema = z.object({
  brand: z.object({
    name: z.string().max(40),
    sublabel: z.string().max(60),
  }),
  banners: z.array(bannerSchema).max(5),
  categories: z.array(categorySchema).max(8),
  brandStory: z.object({
    title: z.string().max(40),
    slogan: z.string().max(40),
    desc: z.string().max(300),
    images: z.array(z.string().max(500)).max(3),
    stats: z
      .array(
        z.object({
          value: z.string().max(20),
          label: z.string().max(20),
        }),
      )
      .max(4),
  }),
  products: z.array(productSchema).max(8),
  productDetail: z
    .object({
      enabled: z.boolean().default(false),
      path: z.string().max(200).default('/pages/product/index'),
    })
    .default({ enabled: false, path: '/pages/product/index' }),
  // 历史配置文件可能没有 store 字段，缺省时补默认门店信息，避免整份配置被判为非法
  store: storeSchema.default(DEFAULT_MINI_HOME.store),
});

/** 读取配置；文件缺失或格式异常时返回默认内容，保证桌面端表单始终可编辑 */
export const readMiniHomeContent = (): MiniHomeContent => {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(MINI_HOME_CONTENT_FILE, 'utf8'));
    const parsed = miniHomeContentSchema.safeParse(raw);
    // zod 3.25 的 object 类型推导会把必填字段标成可选，这里按校验结果显式收窄
    return parsed.success ? (parsed.data as MiniHomeContent) : DEFAULT_MINI_HOME;
  } catch {
    return DEFAULT_MINI_HOME;
  }
};

/** 原子写入，避免小程序端读到写了一半的 JSON */
export const writeMiniHomeContent = (content: MiniHomeContent): void => {
  fs.mkdirSync(NOVA_HOME, { recursive: true });
  const temp = `${MINI_HOME_CONTENT_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(content, null, 2), { mode: 0o600 });
  fs.renameSync(temp, MINI_HOME_CONTENT_FILE);
};
