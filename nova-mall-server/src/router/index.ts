import express from 'express';
import { uploadFile } from './common-controller';
import { memberLogin, updateMember, getMemberInfo } from './member-controller';
import { queryOrderList, queryOrderDetail, queryOrderItemList } from './order-controller';
import { getMarketingList, getMarketingDetail } from './activity-controller';
import { queryMemberBalanceList } from './balance-controller';
import { queryMemberScoreList } from './score-controller';
import { queryMemberCouponList } from './coupon-controller';

const router = express.Router();

router.post('/common/upload', uploadFile);

// 用户相关
router.post('/member/login', memberLogin);
router.post('/member/update', updateMember);
router.get('/member/getInfo', getMemberInfo);

// 订单相关
router.get('/order/list', queryOrderList);
router.get('/order/detail', queryOrderDetail);
router.get('/order/itemList', queryOrderItemList);

// 营销活动相关
router.get('/marketing/list', getMarketingList);
router.get('/marketing/detail', getMarketingDetail);

// 账户余额相关
router.get('/balance/list', queryMemberBalanceList);

// 账户积分相关
router.get('/score/list', queryMemberScoreList);

// 账户优惠券相关
router.get('/coupon/list', queryMemberCouponList);

export default router;