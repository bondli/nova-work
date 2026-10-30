import { OpLog } from '../model/opLog';
import { asyncLocalStorage } from '../middleware/context';

/**
 * 获取当前请求上下文
 */
const getRequestContext = () => {
  return asyncLocalStorage.getStore() || {};
};

/**
 * 获取当前用户ID
 */
const getCurrentUserId = (): string | undefined => {
  const context = getRequestContext();
  return context.userId;
};

/**
 * 获取当前用户操作系统
 */
const getCurrentUserOS = (): string | undefined => {
  const context = getRequestContext();
  return context.userOS;
};

/**
 * 获取当前应用版本
 */
const getCurrentAppVersion = (): string | undefined => {
  const context = getRequestContext();
  return context.appVersion;
};

async function oplog(type: string, info: string) {
  // 从请求上下文中获取用户信息
  const userId = getCurrentUserId();
  const userOS = getCurrentUserOS();
  const appVersion = getCurrentAppVersion();

  await OpLog.create({
    type,
    info,
    userId,
    userOS,
    appVersion,
  });
}

export default oplog;