/**
 * nova-mall-server 配置。
 * 唯一配置来源：`~/.nova/mall-config.json`，不再读取任何环境变量。
 * 包含监听地址、数据库、微信小程序凭证与上传目录；
 * 首次启动自动生成缺失字段并写回（权限 600），数据库首次从 agent-config.json 迁移。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const NOVA_HOME = path.join(os.homedir(), '.nova');
export const MALL_CONFIG_FILE = path.join(NOVA_HOME, 'mall-config.json');

/** 旧版桌面端共用的配置文件，仅用于首次迁移数据库连接 */
const LEGACY_AGENT_CONFIG_FILE = path.join(NOVA_HOME, 'agent-config.json');

export type NormalizedDatabaseConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
};

type DatabaseSection = {
  host?: string;
  port?: number | string;
  username?: string;
  user?: string;
  password?: string;
  database?: string;
  name?: string;
  sqlLog?: boolean;
  sync?: boolean;
};

type WechatSection = {
  appId?: string;
  appSecret?: string;
};

type StorageSection = {
  uploadDir?: string;
  publicBaseUrl?: string;
  /** 上传文件时校验的令牌 */
  uploadToken?: string;
  /** 日志目录，与 POS 服务的 server-config.json 保持一致 */
  logDir?: string;
};

type JwtSection = {
  secret?: string;
  expiresIn?: string;
};

type StoreSection = {
  name?: string;
  address?: string;
  phone?: string;
  hours?: string;
  lat?: number;
  lng?: number;
  image?: string;
};

type SigninSection = {
  rewards?: number[];
  resetOnMiss?: boolean;
};

type LotterySection = {
  cost?: number;
  dailyLimit?: number;
};

type RedeemSection = {
  pickupValidDays?: number;
  perMemberDefault?: number;
};

type BannerSection = {
  tag?: string;
  title?: string;
  desc?: string;
  cta?: string;
  image?: string;
  link?: string;
};

type CategorySection = {
  name?: string;
  size?: string;
  image?: string;
};

type BrandStorySection = {
  title?: string;
  slogan?: string;
  desc?: string;
  images?: string[];
  stats?: { value?: string; label?: string }[];
};

type ProductSection = {
  tag?: string;
  name?: string;
  desc?: string;
  price?: string;
  originPrice?: string;
  image?: string;
};

type MiniHomeSection = {
  brand?: { name?: string; sublabel?: string };
  banners?: BannerSection[];
  categories?: CategorySection[];
  brandStory?: BrandStorySection;
  products?: ProductSection[];
};

type MallServerConfig = {
  baseUrl?: string;
  server?: { host?: string; port?: number | string };
  database?: DatabaseSection;
  wechat?: WechatSection;
  storage?: StorageSection;
  jwt?: JwtSection;
  store?: StoreSection;
  signin?: SigninSection;
  lottery?: LotterySection;
  redeem?: RedeemSection;
  miniHome?: MiniHomeSection;
};

/** 小程序首页默认内容：配置缺失或为空时兜底，图片统一为空字符串由前端渐变兜底 */
const DEFAULT_BANNERS: Required<BannerSection>[] = [
  {
    tag: '秋冬新品',
    title: '秋冬焕新 满 1000 减 150',
    desc: '全场童装通用 · 到店即享',
    cta: '查看活动',
    image: '',
    // 小程序没有独立营销页，留空由客户端提示「关注门店公告」，避免跳转到不存在的路由
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
];

const DEFAULT_CATEGORIES: Required<CategorySection>[] = [
  { name: '女小童', size: '73-150cm', image: '' },
  { name: '男小童', size: '73-150cm', image: '' },
  { name: '女大童', size: '110-160cm', image: '' },
  { name: '男大童', size: '110-160cm', image: '' },
  { name: '婴儿', size: '0-1 岁', image: '' },
  { name: '童鞋', size: '0-13 岁', image: '' },
];

const DEFAULT_PRODUCTS: Required<ProductSection>[] = [
  { tag: '本季新品', name: '奶油针织开衫', desc: 'A 类棉 · 珍珠扣', price: '¥399', originPrice: '¥499', image: '' },
  { tag: '热销', name: '轻盈羽绒马甲', desc: '90% 白鸭绒 · 轻暖', price: '¥459', originPrice: '¥599', image: '' },
  { tag: '人气', name: '纯棉背带裤', desc: 'A 类婴幼儿标准', price: '¥269', originPrice: '¥329', image: '' },
  { tag: '新品', name: '软底学步鞋', desc: '防滑耐磨 · 0-3 岁', price: '¥299', originPrice: '¥369', image: '' },
];

const DEFAULT_BRAND_STORY = {
  title: 'ABOUT DAVE&BELLA',
  slogan: '因爱而生　为爱创造',
  desc: '2011 年创立，专注 0-14 岁儿童服饰。坚持以 A 类婴幼儿标准做贴身衣物，用柔软面料与原创设计，陪伴超过 3000 万家庭的孩子长大。',
  images: [''],
  stats: [
    { value: '3000万+', label: '家庭选择' },
    { value: 'A 类', label: '婴幼儿标准' },
    { value: '0-14 岁', label: '全龄段覆盖' },
  ],
};

let cached: MallServerConfig | null = null;

function randomSecret(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** 展开 ~ 前缀，便于配置里写相对家目录的路径 */
export function expandHome(target: string): string {
  if (target === '~') return os.homedir();
  if (target.startsWith('~/')) return path.join(os.homedir(), target.slice(2));
  return target;
}

/** 读取旧版 agent-config.json 中的数据库段，作为首次迁移来源 */
function readLegacyDatabase(): DatabaseSection | null {
  try {
    const raw = JSON.parse(fs.readFileSync(LEGACY_AGENT_CONFIG_FILE, 'utf8')) as {
      database?: DatabaseSection;
    };
    return raw.database ?? null;
  } catch {
    return null;
  }
}

function parseBaseUrl(baseUrl: string | undefined): { host: string; port: number } {
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      return {
        host: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      };
    } catch {
      // 配置写错时回退默认值
    }
  }
  return { host: '127.0.0.1', port: 9566 };
}

/** 数值配置兜底：非法或非正数时回退默认值 */
function positiveNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 数组配置逐项补默认字段，配置缺失或为空时整套回退默认数据 */
function normalizeBanners(input?: BannerSection[]): Required<BannerSection>[] {
  const source = input && input.length > 0 ? input : DEFAULT_BANNERS;
  return source.map(
    (item, index) =>
      ({ ...(DEFAULT_BANNERS[index] ?? DEFAULT_BANNERS[0]), ...item }) as Required<BannerSection>,
  );
}

function normalizeCategories(input?: CategorySection[]): Required<CategorySection>[] {
  const source = input && input.length > 0 ? input : DEFAULT_CATEGORIES;
  return source.map(
    (item, index) =>
      ({ ...(DEFAULT_CATEGORIES[index] ?? DEFAULT_CATEGORIES[0]), ...item }) as Required<CategorySection>,
  );
}

function normalizeProducts(input?: ProductSection[]): Required<ProductSection>[] {
  const source = input && input.length > 0 ? input : DEFAULT_PRODUCTS;
  return source.map(
    (item, index) =>
      ({ ...(DEFAULT_PRODUCTS[index] ?? DEFAULT_PRODUCTS[0]), ...item }) as Required<ProductSection>,
  );
}

function normalizeBrandStory(input?: BrandStorySection): typeof DEFAULT_BRAND_STORY {
  const images = input?.images && input.images.length > 0 ? input.images : DEFAULT_BRAND_STORY.images;
  const stats =
    input?.stats && input.stats.length > 0
      ? input.stats.map((stat, index) => ({
          value: stat.value ?? DEFAULT_BRAND_STORY.stats[index]?.value ?? '',
          label: stat.label ?? DEFAULT_BRAND_STORY.stats[index]?.label ?? '',
        }))
      : DEFAULT_BRAND_STORY.stats;
  return {
    title: input?.title ?? DEFAULT_BRAND_STORY.title,
    slogan: input?.slogan ?? DEFAULT_BRAND_STORY.slogan,
    desc: input?.desc ?? DEFAULT_BRAND_STORY.desc,
    images,
    stats,
  };
}

/** 把文件内容补齐为完整结构；缺失的上传令牌、JWT 密钥自动生成 */
function normalize(file: MallServerConfig, legacy: DatabaseSection | null): MallServerConfig {
  const baseUrl = file.baseUrl ?? 'http://127.0.0.1:9566';
  const derived = parseBaseUrl(baseUrl);

  return {
    baseUrl,
    server: {
      host: file.server?.host ?? derived.host,
      port: Number(file.server?.port ?? derived.port),
    },
    database: file.database ?? legacy ?? {},
    wechat: {
      appId: file.wechat?.appId ?? '',
      appSecret: file.wechat?.appSecret ?? '',
    },
    storage: {
      uploadDir: file.storage?.uploadDir ?? '~/.nova/mall-files',
      publicBaseUrl: file.storage?.publicBaseUrl ?? baseUrl,
      uploadToken: file.storage?.uploadToken ?? randomSecret(16),
      logDir: file.storage?.logDir ?? '~/.nova/logs',
    },
    // JWT 密钥首次生成后写回配置文件，保证重启后已签发的 token 仍然有效
    jwt: {
      secret: file.jwt?.secret ?? randomSecret(32),
      expiresIn: file.jwt?.expiresIn ?? '7d',
    },
    store: {
      name: file.store?.name ?? 'DaveBella 童装生活馆',
      address: file.store?.address ?? '杭州市 · 万象城 L3 · 儿童区',
      phone: file.store?.phone ?? '0571-8888 6666',
      hours: file.store?.hours ?? '10:00 - 22:00 · 周一至周日',
      lat: Number(file.store?.lat ?? 30.2525),
      lng: Number(file.store?.lng ?? 120.1644),
      image: file.store?.image ?? '',
    },
    signin: {
      rewards: file.signin?.rewards?.length ? file.signin.rewards : [5, 5, 5, 10, 10, 10, 30],
      resetOnMiss: file.signin?.resetOnMiss ?? true,
    },
    lottery: {
      cost: positiveNumber(file.lottery?.cost, 10),
      dailyLimit: positiveNumber(file.lottery?.dailyLimit, 5),
    },
    redeem: {
      pickupValidDays: positiveNumber(file.redeem?.pickupValidDays, 30),
      perMemberDefault: positiveNumber(file.redeem?.perMemberDefault, 1),
    },
    miniHome: {
      brand: {
        name: file.miniHome?.brand?.name ?? 'Dave & Bella',
        sublabel: file.miniHome?.brand?.sublabel ?? 'DAVE & BELLA · KIDS 0-14',
      },
      banners: normalizeBanners(file.miniHome?.banners),
      categories: normalizeCategories(file.miniHome?.categories),
      brandStory: normalizeBrandStory(file.miniHome?.brandStory),
      products: normalizeProducts(file.miniHome?.products),
    },
  };
}

function persist(config: MallServerConfig): void {
  fs.mkdirSync(NOVA_HOME, { recursive: true });
  const temp = `${MALL_CONFIG_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(temp, MALL_CONFIG_FILE);
}

function load(): MallServerConfig {
  let fileContent: MallServerConfig = {};

  if (fs.existsSync(MALL_CONFIG_FILE)) {
    try {
      fileContent = JSON.parse(fs.readFileSync(MALL_CONFIG_FILE, 'utf8')) as MallServerConfig;
    } catch (error) {
      throw new Error(
        `配置文件解析失败：${MALL_CONFIG_FILE}（${(error as Error).message}）`,
      );
    }
  }

  const normalized = normalize(fileContent, readLegacyDatabase());

  // miniHome 仅作内存兜底（首页素材真正来源是 ~/.nova/mini-content.json），不落盘：
  // 文件未配置该段时写回副本也剔除，避免下次启动被 normalize 补齐后又写回配置。
  const toPersist: MallServerConfig = { ...normalized };
  if (!fileContent.miniHome) delete toPersist.miniHome;
  // store 同理：门店信息以桌面端「小程序素材」（mini-content.json）为准，
  // 这里只保留内存兜底；文件里没写就不回写，避免删掉后又被自动补回
  if (!fileContent.store) delete toPersist.store;

  const changed = JSON.stringify(fileContent) !== JSON.stringify(toPersist);
  if (changed || !fs.existsSync(MALL_CONFIG_FILE)) {
    persist(toPersist);
  }

  return normalized;
}

export const getMallConfig = (): MallServerConfig => {
  if (!cached) cached = load();
  return cached;
};

/** 数据库连接；缺失关键字段时直接抛错，避免以错误配置连库 */
export const getDatabaseConfig = (): NormalizedDatabaseConfig => {
  const section = getMallConfig().database ?? {};
  const normalized = {
    host: section.host,
    port: Number(section.port ?? 3306),
    username: section.username ?? section.user,
    password: section.password ?? '',
    database: section.database ?? section.name,
  };

  const missingKeys = (['host', 'username', 'database'] as const).filter(
    (key) => !normalized[key],
  );

  if (missingKeys.length > 0) {
    throw new Error(
      `数据库配置缺失：${missingKeys.join(', ')}。请在 ${MALL_CONFIG_FILE} 的 database 段补全 host / user / database`,
    );
  }

  return {
    host: normalized.host as string,
    port: normalized.port,
    username: normalized.username as string,
    password: normalized.password,
    database: normalized.database as string,
  };
};

/** 是否打印 SQL；由 database.sqlLog 控制 */
export const isSqlLogEnabled = (): boolean => getMallConfig().database?.sqlLog === true;

/** 是否自动同步表结构；由 database.sync 控制，默认关闭 */
export const shouldSyncDatabase = (): boolean => getMallConfig().database?.sync === true;

interface WeixinConfig {
  WECHAT_APP_ID: string;
  WECHAT_APP_SECRET: string;
}

/** 微信小程序凭证；未配置时返回 null */
export const getWeixinConfig = (): WeixinConfig | null => {
  const wechat = getMallConfig().wechat;
  if (!wechat?.appId || !wechat?.appSecret) return null;
  return { WECHAT_APP_ID: wechat.appId, WECHAT_APP_SECRET: wechat.appSecret };
};

/** 监听端口，优先 server.port，其次 baseUrl，最后默认 9566 */
export const getServerPort = (): number => {
  const config = getMallConfig();
  const port = Number(config.server?.port);
  return Number.isFinite(port) && port > 0 ? port : parseBaseUrl(config.baseUrl).port;
};

/** 监听地址，默认仅本机 */
export const getServerHost = (): string =>
  getMallConfig().server?.host ?? parseBaseUrl(getMallConfig().baseUrl).host;

/** 上传目录、访问前缀与上传令牌 */
export const getUploadConfig = (): {
  dir: string;
  publicBaseUrl: string;
  apiKey: string | null;
} => {
  const storage = getMallConfig().storage ?? {};
  const dir = expandHome(storage.uploadDir ?? '~/.nova/mall-files');
  return {
    dir,
    publicBaseUrl:
      storage.publicBaseUrl?.replace(/\/+$/, '') ?? `http://${getServerHost()}:${getServerPort()}`,
    apiKey: storage.uploadToken ?? null,
  };
};

/** 日志目录：默认 ~/.nova/logs，与 POS 服务同一目录，便于统一排查 */
export function getLogDir(): string {
  const dir = expandHome(getMallConfig().storage?.logDir ?? '~/.nova/logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 小程序 /mini 接口运行配置（normalize 后所有字段均已补齐，可直接使用） */
export interface MiniConfig {
  jwt: { secret: string; expiresIn: string };
  store: {
    name: string;
    address: string;
    phone: string;
    hours: string;
    lat: number;
    lng: number;
    image: string;
  };
  signin: { rewards: number[]; resetOnMiss: boolean };
  lottery: { cost: number; dailyLimit: number };
  redeem: { pickupValidDays: number; perMemberDefault: number };
  miniHome: {
    brand: { name: string; sublabel: string };
    banners: Required<BannerSection>[];
    categories: Required<CategorySection>[];
    brandStory: typeof DEFAULT_BRAND_STORY;
    products: Required<ProductSection>[];
  };
}

export const getMiniConfig = (): MiniConfig => getMallConfig() as unknown as MiniConfig;
