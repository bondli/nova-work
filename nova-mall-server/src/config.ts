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
};

type MallServerConfig = {
  baseUrl?: string;
  server?: { host?: string; port?: number | string };
  database?: DatabaseSection;
  wechat?: WechatSection;
  storage?: StorageSection;
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
  return { host: '127.0.0.1', port: 9599 };
}

/** 把文件内容补齐为完整结构；缺失的上传令牌自动生成 */
function normalize(file: MallServerConfig, legacy: DatabaseSection | null): MallServerConfig {
  const baseUrl = file.baseUrl ?? 'http://127.0.0.1:9599';
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

  const changed = JSON.stringify(fileContent) !== JSON.stringify(normalized);
  if (changed || !fs.existsSync(MALL_CONFIG_FILE)) {
    persist(normalized);
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

/** 监听端口，优先 server.port，其次 baseUrl，最后默认 9599 */
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
