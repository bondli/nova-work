/**
 * nova-pos-server 配置。
 * 唯一配置来源：`~/.nova/server-config.json`。
 * 包含监听地址、内部令牌、JWT 密钥、数据库连接、上传目录与日志目录；
 * 首次启动会自动补全缺失字段并写回，权限收紧为 600。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const NOVA_HOME = path.join(os.homedir(), '.nova');
export const SERVER_CONFIG_FILE = path.join(NOVA_HOME, 'server-config.json');

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

type StorageSection = {
  uploadDir?: string;
  logDir?: string;
  /** 小程序素材图片目录（营销页上传的 Banner / 类目 / 商品图） */
  miniImageDir?: string;
  /** 插件上传商品图片时使用的令牌 */
  uploadToken?: string;
};

type RelaySection = {
  /** nova-relay 服务地址，桌面端/手机端通过 /auth/share-token 获取 */
  url?: string;
  /** 群组签名密钥，与 nova-relay 共用，用于校验 groupToken */
  groupSecret?: string;
};

type NovaServerConfig = {
  baseUrl?: string;
  token?: string;
  auth?: { internalToken?: string; jwtSecret?: string };
  server?: { host?: string; port?: number | string };
  database?: DatabaseSection;
  storage?: StorageSection;
  relay?: RelaySection;
};

let cached: NovaServerConfig | null = null;
let cachedMtime = -1;
let cacheCheckedAt = 0;

/** 配置文件缓存 TTL：桌面端改令牌后最多 5 秒生效，避免每个请求都读盘 */
const CONFIG_CACHE_TTL_MS = 5000;

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

/** 从 baseUrl 反推监听地址与端口 */
function parseBaseUrl(baseUrl: string | undefined): { host: string; port: number } {
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      return {
        host: url.hostname,
        port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      };
    } catch {
      // 配置写错时回退默认值，下方仍有校验
    }
  }
  return { host: '127.0.0.1', port: 9577 };
}

/** 把文件内容补齐为完整结构；缺失的密钥自动生成 */
function normalize(file: NovaServerConfig, legacy: DatabaseSection | null): NovaServerConfig {
  const baseUrl = file.baseUrl ?? 'http://127.0.0.1:9577';
  const derived = parseBaseUrl(baseUrl);
  const uploadDir = file.storage?.uploadDir ?? '~/.nova/storage/inventory-image';
  const miniImageDir = file.storage?.miniImageDir ?? '~/.nova/storage/mini-image';
  const logDir = file.storage?.logDir ?? '~/.nova/logs';

  return {
    baseUrl,
    auth: {
      internalToken: file.auth?.internalToken ?? file.token ?? randomSecret(24),
      jwtSecret: file.auth?.jwtSecret ?? randomSecret(48),
    },
    server: {
      host: file.server?.host ?? derived.host,
      port: Number(file.server?.port ?? derived.port),
    },
    database: file.database ?? legacy ?? {},
    storage: {
      uploadDir,
      miniImageDir,
      logDir,
      uploadToken: file.storage?.uploadToken ?? randomSecret(16),
    },
    relay: {
      url: file.relay?.url ?? 'http://127.0.0.1:8722',
      groupSecret: file.relay?.groupSecret ?? randomSecret(32),
    },
  };
}

function persist(config: NovaServerConfig): void {
  fs.mkdirSync(NOVA_HOME, { recursive: true });
  const temp = `${SERVER_CONFIG_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2), { mode: 0o600 });
  fs.renameSync(temp, SERVER_CONFIG_FILE);
}

/** 读取配置；文件不存在时创建默认配置并迁移旧库连接 */
function load(): NovaServerConfig {
  let fileContent: NovaServerConfig = {};

  if (fs.existsSync(SERVER_CONFIG_FILE)) {
    try {
      fileContent = JSON.parse(fs.readFileSync(SERVER_CONFIG_FILE, 'utf8')) as NovaServerConfig;
    } catch (error) {
      throw new Error(
        `配置文件解析失败：${SERVER_CONFIG_FILE}（${(error as Error).message}）`,
      );
    }
  }

  const normalized = normalize(fileContent, readLegacyDatabase());

  // 首次创建或补齐新字段时写回，保证桌面端「数据设置」读取到完整配置
  const changed = JSON.stringify(fileContent) !== JSON.stringify(normalized);
  if (changed || !fs.existsSync(SERVER_CONFIG_FILE)) {
    persist(normalized);
  }

  return normalized;
}

function configMtime(): number {
  try {
    return fs.statSync(SERVER_CONFIG_FILE).mtimeMs;
  } catch {
    return -1;
  }
}

export function getServerConfig(): NovaServerConfig {
  const now = Date.now();
  if (cached && now - cacheCheckedAt < CONFIG_CACHE_TTL_MS) return cached;

  cacheCheckedAt = now;
  const mtime = configMtime();
  if (cached && mtime === cachedMtime) return cached;

  cached = load();
  cachedMtime = configMtime();
  return cached;
}

/** 清空缓存，供配置变更后立即重新读取 */
export function resetServerConfig(): void {
  cached = null;
  cachedMtime = -1;
  cacheCheckedAt = 0;
}

/** 数据库连接；缺失关键字段时直接抛错，避免以错误配置连库 */
export function getDatabaseConfig(): NormalizedDatabaseConfig {
  const section = getServerConfig().database ?? {};
  const normalized = {
    host: section.host,
    port: Number(section.port ?? 3306),
    username: section.username ?? section.user,
    password: section.password ?? '',
    database: section.database ?? section.name,
  };

  const missing = (['host', 'username', 'database'] as const).filter((key) => !normalized[key]);
  if (missing.length > 0) {
    throw new Error(
      `数据库配置缺失：${missing.join(', ')}。请在 ${SERVER_CONFIG_FILE} 的 database 段补全 host / user / database`,
    );
  }

  return {
    host: normalized.host as string,
    port: normalized.port,
    username: normalized.username as string,
    password: normalized.password,
    database: normalized.database as string,
  };
}

/** 是否打印 SQL；由 database.sqlLog 控制 */
export function isSqlLogEnabled(): boolean {
  return getServerConfig().database?.sqlLog === true;
}

/** 是否自动同步表结构；由 database.sync 控制，默认关闭 */
export function shouldSyncDatabase(): boolean {
  return getServerConfig().database?.sync === true;
}

/** 桌面端 / 其它内部服务调用时携带的令牌 */
export function getInternalToken(): string {
  const config = getServerConfig();
  return config.auth?.internalToken ?? '';
}

/** JWT 签名密钥，由服务端自动生成并持久化 */
export function getJwtSecret(): string {
  const config = getServerConfig();
  if (!config.auth?.jwtSecret) throw new Error(`JWT 密钥缺失，请检查 ${SERVER_CONFIG_FILE}`);
  return config.auth.jwtSecret;
}

/** 监听端口，优先 server.port，其次 baseUrl，最后默认 9577 */
export function getServerPort(): number {
  const config = getServerConfig();
  const port = Number(config.server?.port);
  return Number.isFinite(port) && port > 0 ? port : parseBaseUrl(config.baseUrl).port;
}

/** 监听地址：优先环境变量 HOST，其次配置文件（默认 127.0.0.1，需局域网访问时在 server.host 配置） */
export function getServerHost(): string {
  const envHost = process.env.HOST?.trim();
  if (envHost) return envHost;
  return getServerConfig().server?.host ?? '127.0.0.1';
}

export function getUploadDir(): string {
  const dir = expandHome(getServerConfig().storage?.uploadDir ?? '~/.nova/storage/inventory-image');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 小程序素材图片目录：与商品图片分开存放，便于单独备份 / 清理 */
export function getMiniImageDir(): string {
  const dir = expandHome(getServerConfig().storage?.miniImageDir ?? '~/.nova/storage/mini-image');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLogDir(): string {
  const dir = expandHome(getServerConfig().storage?.logDir ?? '~/.nova/logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 插件上传商品图片时的令牌；配置缺失时拒绝上传 */
export function getUploadToken(): string {
  return getServerConfig().storage?.uploadToken ?? '';
}

/** nova-relay 服务地址 */
export function getRelayUrl(): string {
  return getServerConfig().relay?.url ?? '';
}

/** 群组签名密钥，与 nova-relay 共用 */
export function getRelayGroupSecret(): string {
  return getServerConfig().relay?.groupSecret ?? '';
}

/**
 * 生成文件共享群组令牌。
 * storeKey 取 POS 自身 baseUrl（同门店所有设备连同一 POS，自然同组），
 * groupToken = storeKey + ':' + HMAC-SHA256(groupSecret, storeKey)。
 * nova-relay 解析 storeKey 并校验 HMAC，通过后归入该群组。
 */
export function getShareGroupToken(): string {
  const config = getServerConfig();
  const storeKey = config.baseUrl ?? 'http://127.0.0.1:9577';
  const groupSecret = config.relay?.groupSecret ?? '';
  const signature = crypto.createHmac('sha256', groupSecret).update(storeKey).digest('hex');
  return `${storeKey}:${signature}`;
}
