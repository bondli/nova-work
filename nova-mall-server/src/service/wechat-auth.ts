import axios from 'axios';
import logger from '../logger';
import { getWeixinConfig } from '../config';
import { AppError } from '../middleware/error';

interface Code2SessionResult {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

interface PhoneNumberResult {
  errcode?: number;
  errmsg?: string;
  phone_info?: { phoneNumber?: string; purePhoneNumber?: string };
}

interface CachedAccessToken {
  token: string;
  expiresAt: number;
}

let accessTokenCache: CachedAccessToken | null = null;

const notConfiguredError = (): AppError =>
  new AppError(
    500,
    'WECHAT_NOT_CONFIGURED',
    '微信小程序凭证未配置，请先在 ~/.nova/mall-config.json 的 wechat.appId / appSecret 中填写',
  );

const getCredential = (): { appId: string; appSecret: string } => {
  const config = getWeixinConfig();
  if (!config || !config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET) {
    throw notConfiguredError();
  }
  return { appId: config.WECHAT_APP_ID, appSecret: config.WECHAT_APP_SECRET };
};

/** wx.login 的 code 换 openid；微信返回业务错误时抛 500，避免把失败当成功 */
export const code2Session = async (code: string): Promise<{ openid: string; unionid?: string }> => {
  const { appId, appSecret } = getCredential();
  try {
    const response = await axios.get<Code2SessionResult>('https://api.weixin.qq.com/sns/jscode2session', {
      params: { appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' },
      timeout: 10_000,
    });
    const data = response.data;
    if (data.errcode || !data.openid) {
      logger.error(`jscode2session 失败 errcode=${data.errcode}, errmsg=${data.errmsg}`);
      throw new AppError(500, 'WECHAT_API_ERROR', `微信登录失败：${data.errmsg ?? '未返回 openid'}`);
    }
    return { openid: data.openid, unionid: data.unionid };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('jscode2session 请求异常:', error instanceof Error ? error.message : error);
    throw new AppError(500, 'WECHAT_API_ERROR', '微信登录失败，请稍后重试');
  }
};

/** access_token 缓存（提前 60 秒过期），供手机号解密接口复用 */
const getAccessToken = async (): Promise<string> => {
  const now = Date.now();
  if (accessTokenCache && accessTokenCache.expiresAt - 60_000 > now) {
    return accessTokenCache.token;
  }

  const { appId, appSecret } = getCredential();
  try {
    const response = await axios.get<{
      access_token?: string;
      expires_in?: number;
      errcode?: number;
      errmsg?: string;
    }>('https://api.weixin.qq.com/cgi-bin/token', {
      params: { grant_type: 'client_credential', appid: appId, secret: appSecret },
      timeout: 10_000,
    });
    const data = response.data;
    if (data.errcode || !data.access_token) {
      logger.error(`获取 access_token 失败 errcode=${data.errcode}, errmsg=${data.errmsg}`);
      throw new AppError(500, 'WECHAT_API_ERROR', `获取微信凭证失败：${data.errmsg ?? '未知错误'}`);
    }
    accessTokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in ?? 7200) * 1000,
    };
    return data.access_token;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('获取 access_token 异常:', error instanceof Error ? error.message : error);
    throw new AppError(500, 'WECHAT_API_ERROR', '获取微信凭证失败，请稍后重试');
  }
};

/** 新版 getPhoneNumber 的 phoneCode 换取手机号 */
export const getPhoneByPhoneCode = async (phoneCode: string): Promise<string> => {
  const accessToken = await getAccessToken();
  try {
    const response = await axios.post<PhoneNumberResult>(
      `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`,
      { code: phoneCode },
      { timeout: 10_000 },
    );
    const data = response.data;
    if (data.errcode !== 0 || !data.phone_info?.phoneNumber) {
      logger.error(`getuserphonenumber 失败 errcode=${data.errcode}, errmsg=${data.errmsg}`);
      throw new AppError(500, 'WECHAT_API_ERROR', `获取手机号失败：${data.errmsg ?? '未知错误'}`);
    }
    return data.phone_info.phoneNumber;
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('getuserphonenumber 异常:', error instanceof Error ? error.message : error);
    throw new AppError(500, 'WECHAT_API_ERROR', '获取手机号失败，请稍后重试');
  }
};
