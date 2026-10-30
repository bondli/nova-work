import type { Transaction } from 'sequelize';

import { sequelize } from '../model';

/** 统一事务入口：回调抛错自动回滚，成功自动提交 */
export const withTransaction = <T>(handler: (transaction: Transaction) => Promise<T>): Promise<T> => {
  return sequelize.transaction(handler);
};

/** 唯一键冲突：用于订单号并发重试 */
export const isUniqueConstraintError = (error: unknown): boolean => {
  return Boolean(error && typeof error === 'object' && (error as { name?: string }).name === 'SequelizeUniqueConstraintError');
};
