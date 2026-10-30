import { Request, Response } from 'express';
import logger from '../logger';
import { Member } from '../model/member';
import { WeChatUtils } from '../utils/wechat-utils';

import { getWeixinConfig } from '../config';

// 查询会员详情
export const getMemberInfo = async (req: Request, res: Response) => {
  try {
    const { phone } = req.query;
    const result = await Member.findOne({
      where: {
        phone,
      },
    });
    if (result) {
      res.json(result.toJSON());
    } else {
      res.json({ error: 'Member not found' });
    }
  } catch (error) {
    logger.error('Error getting Member by phone:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 更新会员信息
export const updateMember = async (req: Request, res: Response) => {
  try {
    const { phone } = req.query;
    const { name, birthday } = req.body;
    const result = await Member.findOne({
      where: {
        phone,
      },
    });
    if (result) {
      await result.update({ name, birthday });
      res.json(result.toJSON());
    } else {
      res.json({ error: 'member not found' });
    }
  } catch (error) {
    logger.error('Error updating member:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// 会员登录
export const memberLogin = async (req: Request, res: Response) => {
  const config = getWeixinConfig() || { WECHAT_APP_ID: '', WECHAT_APP_SECRET: '' };
  // 验证微信配置
  if (!config.WECHAT_APP_ID || !config.WECHAT_APP_SECRET) {
    res.status(500).json({ 
      success: false,
      message: '请在配置文件中设置 WECHAT_APP_ID 和 WECHAT_APP_SECRET' 
    });
    return;
  }

  const wechatUtils = new WeChatUtils(
    config.WECHAT_APP_ID!,
    config.WECHAT_APP_SECRET!
  );
  try {
    const { code, encryptedData, iv } = req.body;
    logger.info(`memberLogin body: code=${!!code}, encryptedData=${JSON.stringify(encryptedData)}, iv=${JSON.stringify(iv)}`);
    // 参数验证
    if (!code) {
      res.status(400).json({ 
        success: false,
        message: '缺少必要参数 code', 
      });
      return;
    }

    let phoneNumber: string;

    if (code && !encryptedData && !iv) {
      // 新版 API：code only（未来兼容路径，encryptedData/iv 均不存在）
      phoneNumber = await wechatUtils.getPhoneNumberByCode(code);
    } else if (code) {
      // 当前微信新版 getPhoneNumber API 同时返回 code + encryptedData + iv
      // 但 code 是一次性 phone number token，应使用 getuserphonenumber 接口换取手机号
      // encryptedData/iv 是旧字段，已不可靠，优先使用 code
      phoneNumber = await wechatUtils.getPhoneNumberByCode(code);
    } else {
      res.status(400).json({ success: false, message: '缺少必要参数 code' });
      return;
    }

    const result = await Member.findOne({
      where: {
        phone: phoneNumber,
      },
    });
    if (result === null) {
      res.json({ success: false, message: 'member not found' });
    } else {
      res.json({
        success: true,
        data: result.toJSON(),
      });
    }
  } catch (error) {
    logger.error('Error login member:', error instanceof Error ? error.message : error, error instanceof Error ? error.stack : undefined);
    res.status(500).json({ error: 'Internal server error' });
  }
};
