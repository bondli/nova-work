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
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});
