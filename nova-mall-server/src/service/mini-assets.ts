/**
 * 小程序素材图片访问。
 * 图片由桌面端经 nova-pos-server 上传后落在 `~/.nova/storage/mini-image`，
 * 小程序端不直接暴露 POS 服务的域名与路径，统一改写成 mall-server 的
 * `/files/mini-image/*` 静态地址（即小程序合法域名下的地址）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { NOVA_HOME, expandHome, getMallConfig } from '../config';
import type { MiniHomeContent, MiniHomeStore } from './mini-home-content';

/** POS 服务配置文件，用于定位它实际使用的 mini-image 目录（两台服务同机部署） */
const POS_CONFIG_FILE = path.join(NOVA_HOME, 'server-config.json');
const DEFAULT_MINI_IMAGE_DIR = '~/.nova/storage/mini-image';
const MINI_IMAGE_MARKER = '/mini-image/';

/** POS 素材图片的磁盘目录；POS 配置里自定义了目录时跟随，否则用默认路径 */
export const getMiniImageDir = (): string => {
  try {
    const raw = JSON.parse(fs.readFileSync(POS_CONFIG_FILE, 'utf8')) as {
      storage?: { miniImageDir?: string };
    };
    const dir = raw.storage?.miniImageDir;
    if (dir) return expandHome(dir);
  } catch {
    // 配置文件缺失或损坏时忽略，走默认目录
  }
  return expandHome(DEFAULT_MINI_IMAGE_DIR);
};

/** 对外访问前缀：mall 自身域名（生产环境需配置成小程序合法域名） */
const getMiniImagePublicBase = (): string => {
  const baseUrl = (getMallConfig().baseUrl ?? '').replace(/\/+$/, '');
  if (baseUrl) return baseUrl;
  const port = Number(getMallConfig().server?.port) || 9566;
  return `http://127.0.0.1:${port}`;
};

/**
 * 把 POS 返回的绝对图片地址（`.../mini-image/xxx.jpg`）改写成
 * `${mallBase}/files/mini-image/xxx.jpg`；非素材地址原样返回。
 */
export const toMiniAssetUrl = (url?: string): string => {
  if (!url) return '';
  const index = url.indexOf(MINI_IMAGE_MARKER);
  if (index < 0) return url;
  return `${getMiniImagePublicBase()}/files/mini-image/${url.slice(index + MINI_IMAGE_MARKER.length)}`;
};

/** 门店信息里的图片同样改写（首页「到店体验」与「我的-门店信息」共用） */
export const rewriteMiniStore = (store: MiniHomeStore): MiniHomeStore => ({
  ...store,
  image: toMiniAssetUrl(store.image),
});

/** 首页素材里的所有图片字段统一改写成 mall 域名下的静态地址 */
export const rewriteMiniHomeContent = (content: MiniHomeContent): MiniHomeContent => ({
  ...content,
  banners: (content.banners ?? []).map((item) => ({ ...item, image: toMiniAssetUrl(item.image) })),
  categories: (content.categories ?? []).map((item) => ({
    ...item,
    image: toMiniAssetUrl(item.image),
  })),
  brandStory: {
    ...content.brandStory,
    images: (content.brandStory?.images ?? []).map(toMiniAssetUrl),
  },
  products: (content.products ?? []).map((item) => ({
    ...item,
    image: toMiniAssetUrl(item.image),
    detailImages: (item.detailImages ?? []).map(toMiniAssetUrl),
  })),
  ...(content.store ? { store: rewriteMiniStore(content.store) } : {}),
});
