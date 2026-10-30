import { Sequelize } from 'sequelize';
import logger from '../logger';
import { getDatabaseConfig, isSqlLogEnabled } from '../config';

const DB_CONFIG = getDatabaseConfig();
const enableSqlLog = isSqlLogEnabled();

logger.info('Database Config Host:', DB_CONFIG.host);

// 使用到的是sequelize，文档：
// https://github.com/demopark/sequelize-docs-Zh-CN/blob/v6/core-concepts/model-querying-basics.md
export const sequelize = new Sequelize({
  dialect: 'mysql',
  ...DB_CONFIG,

  logging: enableSqlLog ? (msg) => logger.info(msg) : false,
  dialectOptions: {
    // 设置时区
    timezone: '+08:00',
    dateStrings: true,
    typeCast: true
  },
  timezone: '+08:00', // 添加全局时区设置
  pool: {
    max: 15,        // 增加最大连接数
    min: 2,         // 设置最小连接数，保持连接池活跃
    acquire: 10000, // 减少获取连接的超时时间（从30s减少到10s）
    idle: 5000,     // 减少空闲连接超时时间（从10s减少到5s）
    evict: 1000,    // 添加连接回收检查间隔
  },
});
