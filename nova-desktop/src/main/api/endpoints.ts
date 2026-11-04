/**
 * 允许渲染层经主进程转发的 pos-server 端点。
 * 用「方法 + 路径」精确匹配，避免把写接口暴露成 GET。
 */
const ENDPOINTS = [
  // 订单
  'GET /order/queryList',
  'GET /order/queryItemList',
  'GET /order/queryDetail',
  'GET /order/queryOrderSummary',
  'GET /order/queryOrderRate',
  'GET /order/queryCouponList',
  'GET /order/queryBySku',
  'GET /order/queryOrderItemListByDate',
  'POST /order/exportOrderItemList',
  'POST /order/checkBill',
  'POST /order/modify',
  'POST /order/refundItem',
  'POST /order/changeItem',
  'POST /order/toggleShow',
  'POST /order/updatePrintStatus',
  // 买单
  'POST /buy/submit',
  'GET /buy/getStoreCoupon',
  // 库存
  'GET /inventory/queryTotal',
  'GET /inventory/summary',
  'GET /inventory/queryList',
  'GET /inventory/queryDetailBySku',
  'GET /inventory/queryByStyle',
  'GET /inventory/getNoStockList',
  'GET /inventory/getHotSalesList',
  'GET /inventory/skuRecord',
  'GET /inventory/records',
  'POST /inventory/update',
  'POST /inventory/create',
  'POST /inventory/batchProcessPurchaseData',
  'POST /inventory/batchProcessReturnsData',
  'POST /inventory/batchCreate',
  'POST /inventory/batchReturns',
  'POST /inventory/template',
  // 会员
  'GET /member/list',
  'GET /member/summary',
  'GET /member/detail',
  'GET /member/queryScoreList',
  'GET /member/queryBalanceList',
  'GET /member/queryCouponList',
  'GET /member/queryBigdayCouponList',
  'GET /member/queryDrawRecord',
  'POST /member/submitUserDrawed',
  'POST /member/create',
  'POST /member/update',
  'POST /member/incomeBalance',
  'POST /member/updateBalance',
  'POST /member/updateScore',
  // 营销
  'GET /marketing/list',
  'GET /marketing/queryDetail',
  'GET /marketing/queryCouponList',
  'POST /marketing/create',
  'POST /marketing/update',
  'POST /marketing/delete',
  'POST /marketing/offline',
  'GET /marketing/miniHome',
  'POST /marketing/miniHome',
  'POST /marketing/uploadImage',
  // 积分兑换
  'GET /redeem/items',
  'POST /redeem/create',
  'POST /redeem/update',
  'GET /redeem/orders',
  'POST /redeem/verify',
  // 数据
  'POST /data/getCoreData',
  'GET /data/getOrderCharts',
  'GET /data/getStoreCharts',
  'GET /data/getStoreDailyCharts',
  'GET /data/getSalerCharts',
  'GET /data/getSalerDailyCharts',
  // 员工与通用
  // 注意：/user/login 与 /user/register 由主进程的账号服务直接调用（登录前没有 JWT）
  'GET /user/list',
  'POST /common/uploadFile',
  'GET /common/opLogs'
] as const

const ALLOWED = new Set<string>(ENDPOINTS)

export function isEndpointAllowed(method: string, path: string): boolean {
  return ALLOWED.has(`${method.toUpperCase()} ${path}`)
}
