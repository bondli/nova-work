import axios from 'axios';

// 企业微信配置
const CORP_ID = 'ww4478a4996910bfe9';
const SECRET = 'YP9MWgbGiX69Xon1K5jIAkjuSJLElAr90uBsL_e48IE';
const AGENT_ID = '1000002';

// 获取access_token
async function getAccessToken() {
  const url = `https://qyapi.weixin.qq.com/cgi-bin/gettoken?corpid=${CORP_ID}&corpsecret=${SECRET}`;
  const response = await axios.get(url);
  return response.data.access_token;
}

// 发送消息到企业微信
async function sendToWeChat(orderInfo, orderSummary) {
  try {
    const accessToken = await getAccessToken();
    const url = `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${accessToken}`;
    
    const message = {
      touser: '@all', // 或指定用户
      msgtype: 'text',
      agentid: AGENT_ID,
      text: {
        content: `新订单:\n${JSON.stringify(orderInfo, null, 2)}\n今日订单:\n${JSON.stringify(orderSummary, null, 2)}`
      },
      safe: 0
    };
    console.log('message:', message, accessToken);
    const res = await axios.post(url, message);
    console.log('res:', res.data);
    console.log('消息发送成功');
  } catch (error) {
    console.error('发送消息失败:', error.message);
  }
}

export default {
  sendToWeChat
}