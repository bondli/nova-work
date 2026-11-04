/**
 * 小程序首页素材共享配置。
 * 文件由桌面端「营销 - 小程序素材」经 nova-pos-server 写入，
 * mall-server 每次请求读取，保证桌面端保存后小程序立即生效。
 */
import fs from 'node:fs';
import path from 'node:path';
import { NOVA_HOME } from '../config';

export const MINI_HOME_CONTENT_FILE = path.join(NOVA_HOME, 'mini-content.json');

export interface MiniHomeBanner {
  tag: string;
  title: string;
  desc: string;
  cta: string;
  image: string;
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
  /** 关联库存款号（Inventory.sn），商详页据此查询 SKU 列表；旧配置可能缺省 */
  sn?: string;
  /** 商详页详描图；旧配置可能缺省 */
  detailImages?: string[];
}

/** 首页「本季新品」点击行为：开关 + 小程序商详页路径；旧配置可能缺省 */
export interface MiniHomeProductDetail {
  enabled: boolean;
  path: string;
}

/** 门店信息：首页「到店体验」与「我的-门店信息」共用；旧配置文件可能缺失该字段 */
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
  productDetail?: MiniHomeProductDetail;
  store?: MiniHomeStore;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * 读取共享配置；文件缺失或结构不完整时返回 null，
 * 调用方回退到 mall-config.json 里的默认 miniHome，避免首页白屏。
 */
export const readSharedMiniHome = (): MiniHomeContent | null => {
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(MINI_HOME_CONTENT_FILE, 'utf8'));
    if (!isRecord(raw) || !isRecord(raw.brand) || !isRecord(raw.brandStory)) return null;
    if (
      !Array.isArray(raw.banners) ||
      !Array.isArray(raw.categories) ||
      !Array.isArray(raw.products)
    ) {
      return null;
    }
    return raw as unknown as MiniHomeContent;
  } catch {
    return null;
  }
};
