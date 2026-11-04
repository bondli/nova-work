import express from 'express';
import { auth, optionalAuth } from '../middleware/auth';
import { loginRateLimit, memberActionRateLimit } from '../middleware/rate-limit';
import { miniLogin, miniSilent } from './mini-auth-controller';
import { getMiniHome, getMiniMarketings, getMiniStore } from './mini-home-controller';
import { getMiniProduct } from './mini-product-controller';
import { getMiniActivityDetail, postMiniActivityCouponClaim } from './mini-activity-controller';
import {
  getMiniBalance,
  getMiniCoupons,
  getMiniDraws,
  getMiniOrderDetail,
  getMiniOrders,
  getMiniPoints,
  getMiniProfile,
  updateMiniProfile,
} from './mini-member-controller';
import { getMiniSigninStatus, postMiniSignin } from './mini-signin-controller';
import { getMiniLotteryConfig, postMiniLotteryDraw } from './mini-lottery-controller';
import {
  getMiniRedeemOrders,
  getMiniRedeems,
  postMiniRedeem,
} from './mini-redeem-controller';

const router = express.Router();

// ===== 会员小程序接口 /mini/* =====

// 公开接口：首页 / 活动 / 门店，免登录
router.get('/mini/home', getMiniHome);
router.get('/mini/products/:sn', getMiniProduct);
router.get('/mini/marketings', getMiniMarketings);
router.get('/mini/store', getMiniStore);
// 活动详情公开可浏览；带上 token 时额外返回券的领取状态
router.get('/mini/activities/:id', optionalAuth, getMiniActivityDetail);

// 登录接口公开，但限制 10 次/分钟/IP
router.post('/mini/auth/login', loginRateLimit, miniLogin);
router.post('/mini/auth/silent', loginRateLimit, miniSilent);

// 其余 /mini/* 全部需要 JWT 鉴权
router.use('/mini', auth);

router.get('/mini/profile', getMiniProfile);
router.patch('/mini/profile', updateMiniProfile);

router.get('/mini/orders', getMiniOrders);
router.get('/mini/orders/:orderSn', getMiniOrderDetail);

router.get('/mini/points', getMiniPoints);
router.get('/mini/balance', getMiniBalance);
router.get('/mini/coupons', getMiniCoupons);
router.get('/mini/draws', getMiniDraws);
router.post('/mini/activities/:id/coupons/:couponId/claim', memberActionRateLimit, postMiniActivityCouponClaim);

router.get('/mini/signin/status', getMiniSigninStatus);
router.post('/mini/signin', postMiniSignin);

router.get('/mini/lottery/config', getMiniLotteryConfig);
router.post('/mini/lottery/draw', memberActionRateLimit, postMiniLotteryDraw);

router.get('/mini/redeems', getMiniRedeems);
router.post('/mini/redeems/:id/redeem', memberActionRateLimit, postMiniRedeem);
router.get('/mini/redeem-orders', getMiniRedeemOrders);

export default router;