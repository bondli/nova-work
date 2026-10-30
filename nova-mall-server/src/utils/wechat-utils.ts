import * as crypto from 'node:crypto';
import axios from 'axios';
import logger from '../logger';

/**
 * 微信登录工具类
 */
export class WeChatUtils {
  private appId: string;
  private appSecret: string;

  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  /**
   * 获取微信 session_key 和 openid
   * @param code 微信登录时获取的 code
   * @returns Promise<{session_key: string, openid: string, unionid?: string}>
   */
  async getSessionKey(code: string): Promise<{
    session_key: string;
    openid: string;
    unionid?: string;
    errcode?: number;
    errmsg?: string;
  }> {
    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const params = {
      appid: this.appId,
      secret: this.appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    };

    try {
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error) {
      logger.error('获取微信 session_key 失败:', error);
      throw new Error('获取微信 session_key 失败');
    }
  }

  /**
   * 解密微信用户手机号
   * @param encryptedData 包括敏感数据在内的完整用户信息的加密数据
   * @param iv 加密算法的初始向量
   * @param sessionKey 会话密钥
   * @returns Promise<any> 解密后的用户信息
   */
  decryptPhoneNumber(
    encryptedData: string,
    iv: string,
    sessionKey: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // 创建解密算法
        const decipher = crypto.createDecipheriv(
          'aes-128-cbc',
          Buffer.from(sessionKey, 'base64'),
          Buffer.from(iv, 'base64')
        );
        decipher.setAutoPadding(true);

        let decoded = decipher.update(encryptedData, 'base64', 'utf8');
        decoded += decipher.final('utf8');

        const decodedInfo = JSON.parse(decoded);
        
        // 验证解密数据的合法性
        if (decodedInfo.watermark.appid !== this.appId) {
          reject(new Error('解密数据不合法'));
          return;
        }

        resolve(decodedInfo);
      } catch (error) {
        logger.error('解密微信数据失败:', error);
        reject(new Error('解密微信数据失败'));
      }
    });
  }

  /**
   * 获取微信接口调用凭证 access_token
   */
  async getAccessToken(): Promise<string> {
    const url = 'https://api.weixin.qq.com/cgi-bin/token';
    const params = {
      grant_type: 'client_credential',
      appid: this.appId,
      secret: this.appSecret,
    };
    try {
      const response = await axios.get(url, { params });
      if (response.data.errcode) {
        throw new Error(`获取 access_token 失败: ${response.data.errmsg}`);
      }
      return response.data.access_token as string;
    } catch (error) {
      logger.error('获取 access_token 失败:', error);
      throw new Error('获取 access_token 失败');
    }
  }

  /**
   * 使用手机号 code（新版 getPhoneNumber API）直接换取手机号
   * @param code wx.getPhoneNumber 返回的 detail.code
   * @returns Promise<string> 用户手机号
   */
  async getPhoneNumberByCode(code: string): Promise<string> {
    const accessToken = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/wxa/business/getuserphonenumber?access_token=${accessToken}`;
    try {
      const response = await axios.post(url, { code });
      const data = response.data;
      if (data.errcode !== 0) {
        logger.error(`getuserphonenumber 错误 errcode=${data.errcode}, errmsg=${data.errmsg}`);
        throw new Error(`微信接口错误: ${data.errmsg}`);
      }
      return data.phone_info.phoneNumber as string;
    } catch (error) {
      logger.error('getPhoneNumberByCode 失败:', error);
      throw error instanceof Error ? error : new Error('获取手机号失败');
    }
  }

  /**
   * 完整的微信手机号解密流程（旧版，保留兼容）
   * @param code 微信登录code
   * @param encryptedData 加密数据
   * @param iv 初始向量
   * @returns Promise<string> 用户手机号
   */
  async decryptUserPhoneNumber(
    code: string,
    encryptedData: string,
    iv: string
  ): Promise<string> {
    // 1. 获取 session_key
    const sessionResult = await this.getSessionKey(code);
    
    if (sessionResult.errcode) {
      logger.error(`微信接口错误 errcode=${sessionResult.errcode}, errmsg=${sessionResult.errmsg}`);
      throw new Error(`微信接口错误: ${sessionResult.errmsg}`);
    }

    // 2. 解密手机号
    const decryptedData = await this.decryptPhoneNumber(
      encryptedData,
      iv,
      sessionResult.session_key
    );

    // 3. 返回手机号
    if (decryptedData.phoneNumber) {
      return decryptedData.phoneNumber;
    } else {
      throw new Error('解密后的数据中没有手机号');
    }
  }
}
