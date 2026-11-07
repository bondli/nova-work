import * as net from 'net';
import express from 'express';
import cors from 'cors';
import logger from './logger';
import { sequelize } from './model/index';
import router from './router/index';
import { issueSessionToken, mobileLogin, issueShareToken } from './router/auth-controller';
import { createUser, userLogin } from './router/user-controller';
import { contextMiddleware } from './middleware/context';
import { createRateLimit, LOGIN_RATE_LIMIT } from './middleware/rate-limit';
import { internalAuth, internalTokenAuth } from './middleware/internal-auth';
import { uploadInventoryImage } from './router/inventory-controller';
import {
  getServerHost,
  getServerPort,
  getUploadDir,
  getMiniImageDir,
  shouldSyncDatabase,
  SERVER_CONFIG_FILE,
} from './config';

const PORT = getServerPort();
const HOST = getServerHost();

// 检查端口是否被占用
const checkPort = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, HOST);
  });
};

const app = express();
app.disable('x-powered-by');

// 允许的来源：本机开发地址、Electron file://（Origin 为 null）以及无 Origin 的原生客户端
const ALLOWED_ORIGIN = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?|file:\/\/.*)$/i;

const syncDatabaseIfEnabled = async (): Promise<void> => {
  if (!shouldSyncDatabase()) return;

  logger.warn('[Pos Server] 数据库结构同步已开启（database.sync=true），仅建议在本地开发使用。');
  await sequelize.sync();
};

// 解析 JSON 请求体，最大 50MB
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === 'null' || ALLOWED_ORIGIN.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);

// 健康检查不需要业务鉴权
app.get('/health', (_req, res) => {
  res.json({
    code: 0,
    data: { status: 'ok', service: 'nova-pos-server', configPath: SERVER_CONFIG_FILE },
  });
});

// 内部令牌换取 JWT：必须在业务鉴权之前注册
app.post('/auth/token', internalTokenAuth, issueSessionToken);

// 手机端登录：手机端没有内部令牌，改为账号口令 + 限流，一次请求签发 JWT
app.post('/auth/mobile-login', createRateLimit(LOGIN_RATE_LIMIT), mobileLogin);

// 文件共享群组令牌：桌面端用内部令牌换取（在业务鉴权之前）
app.post('/auth/share-token', internalTokenAuth, issueShareToken);

// 登录与注册：登录前还没有 JWT，只能靠内部令牌鉴权，同样必须在业务鉴权之前注册
app.post('/user/login', internalTokenAuth, userLogin);
app.post('/user/register', internalTokenAuth, createUser);

// 浏览器插件采集商品图片：只校验 URL 上的上传令牌，插件无登录态
app.post('/inventory/uploadImage', uploadInventoryImage);

// 静态资源：商品图片。<img> 标签无法携带 Authorization，必须在业务鉴权之前注册，
// 否则桌面端/手机端的图片请求会被 internalAuth 拦截成 401，表现为「该款号暂无图片」。
// maxAge 取短值：同款重复采集会覆盖同名文件，需让客户端按 ETag/Last-Modified 重新校验。
app.use(
  '/inventory-image',
  express.static(getUploadDir(), {
    maxAge: '1m',
    etag: true,
    lastModified: true,
  }),
);

// 静态资源：小程序素材图片。小程序 <Image> 同样无法携带 Authorization，
// 必须在业务鉴权之前注册；文件名带时间戳与随机串，不做覆盖，可放宽缓存。
app.use(
  '/mini-image',
  express.static(getMiniImageDir(), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
  }),
);

// 业务鉴权：JWT 验签 + 角色权限 + 成本字段裁剪
app.use(internalAuth);
// 添加请求上下文中间件
app.use(contextMiddleware);

// 文件共享群组令牌：手机端用 JWT 换取（在业务鉴权之后）
app.post('/auth/share-token/mobile', issueShareToken);

app.use(router);

(async () => {
  try {
    const portAvailable = await checkPort(PORT);
    if (!portAvailable) {
      logger.error(`[Pos Server] Port ${PORT} is already in use.`);
      process.exit(1);
    }

    await sequelize.authenticate();
    logger.info('[Pos Server] Connection has been established successfully.');

    await syncDatabaseIfEnabled();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`[Pos Server] Server is running on ${HOST}:${PORT}`);
      logger.info(`[Pos Server] Config file: ${SERVER_CONFIG_FILE}`);
      if (process.send) {
        process.send({ type: 'server-started', port: PORT });
      }
    });

    const shutdown = (): void => {
      server.close(() => {
        void sequelize.close().finally(() => process.exit(0));
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    logger.error('[Pos Server] Error starting server:', error);
    if (process.send) {
      process.send({
        type: 'server-error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(1);
  }
})();
