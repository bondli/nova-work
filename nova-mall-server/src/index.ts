import * as net from 'net';
import * as fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import logger from './logger';
import { sequelize } from './model/index';
import router from './router/index';
import { getServerHost, getServerPort, getUploadConfig, MALL_CONFIG_FILE, shouldSyncDatabase } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import { getMiniImageDir } from './service/mini-assets';

const PORT = getServerPort();
const HOST = getServerHost();
const uploadConfig = getUploadConfig();

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

const syncDatabaseIfEnabled = async (): Promise<void> => {
  if (!shouldSyncDatabase()) return;

  logger.warn('[Mall Server] 数据库结构同步已开启（database.sync=true），仅建议在本地开发使用。');
  await sequelize.sync();
};

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(bodyParser.json());
app.use(cors());
app.options('*', cors());

app.get('/health', (_req, res) => {
  res.json({ code: 0, data: { status: 'ok', service: 'nova-mall-server' } });
});

// 小程序素材图片：POS 上传后落在 mini-image 目录，这里从同机磁盘只读转发，
// 让小程序端只看到 mall 自己的域名，不暴露 POS 服务的域名与路径。
app.use(
  '/files/mini-image',
  express.static(getMiniImageDir(), {
    maxAge: '7d',
    etag: true,
    lastModified: true,
    index: false,
    dotfiles: 'ignore',
  }),
);

// 上传文件静态访问
fs.mkdirSync(uploadConfig.dir, { recursive: true });
app.use(
  '/files',
  express.static(uploadConfig.dir, {
    maxAge: '1y',
    etag: true,
    lastModified: true,
  }),
);

app.use(router);

app.all('*', (_req, res, next) => {
  res.header('X-Powered-By', 'MALL-STORE-SERVER');
  next();
});

// 统一 404 与异常响应（不泄露堆栈），必须挂在所有路由之后
app.use(notFoundHandler);
app.use(errorHandler);

(async () => {
  try {
    const portAvailable = await checkPort(PORT);
    if (!portAvailable) {
      logger.error(`[Mall Server] Port ${PORT} is already in use.`);
      process.exit(1);
    }

    await sequelize.authenticate();
    logger.info('[Mall Server] Connection has been established successfully.');

    await syncDatabaseIfEnabled();

    const server = app.listen(PORT, HOST, () => {
      logger.info(`[Mall Server] Server is running on ${HOST}:${PORT}`);
      logger.info(`[Mall Server] Config file: ${MALL_CONFIG_FILE}`);
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
    logger.error('[Mall Server] Error starting server:', error);
    if (process.send) {
      process.send({
        type: 'server-error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(1);
  }
})();
