/**
 * 小程序首页素材配置，与 nova-pos-server 写入的 `~/.nova/mini-content.json` 对齐。
 * 桌面端「营销 - 小程序基础信息 / 小程序 banner / 小程序新品」负责编辑，
 * mall-server `/mini/home`、`/mini/store` 直接读取。
 */

export interface MiniHomeBanner {
  tag: string
  title: string
  desc: string
  cta: string
  image: string
  /** 小程序页面路径，留空时客户端只提示活动信息 */
  link: string
}

export interface MiniHomeCategory {
  name: string
  size: string
  image: string
}

export interface MiniHomeBrandStory {
  title: string
  slogan: string
  desc: string
  images: string[]
  stats: Array<{ value: string; label: string }>
}

export interface MiniHomeProduct {
  tag: string
  name: string
  desc: string
  price: string
  originPrice: string
  image: string
  /** 关联库存款号（Inventory.sn），商详页据此查询 SKU 列表 */
  sn: string
  /** 商详页详描图，留空时商详页仅展示主图 */
  detailImages: string[]
}

/** 首页「本季新品」点击行为：开关 + 小程序商详页路径 */
export interface MiniHomeProductDetail {
  enabled: boolean
  path: string
}

/** 门店信息：首页「到店体验」与「我的-门店信息」共用同一份配置 */
export interface MiniHomeStore {
  name: string
  address: string
  hours: string
  phone: string
  lat: number
  lng: number
  image: string
}

export interface MiniHomeContent {
  brand: { name: string; sublabel: string }
  banners: MiniHomeBanner[]
  categories: MiniHomeCategory[]
  brandStory: MiniHomeBrandStory
  products: MiniHomeProduct[]
  productDetail: MiniHomeProductDetail
  store: MiniHomeStore
}
