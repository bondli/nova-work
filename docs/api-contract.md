# nova-pos-server 内部 API 契约（D6 冻结版）

> 日期：2026-10-26  
> 调用方：nova-desktop（经主进程 HTTP 代理）、后续 nova-mobile / nova-miniapp  
> 基线：`~/githubProjects/nova/services/storepos-api` 平迁后的 nova-pos-server  
> 变更原则：字段只增不改；删除字段需先确认桌面端不再引用。

---

## 1. 连接与鉴权

| 项 | 说明 |
|---|---|
| 默认地址 | `http://127.0.0.1:9577`（由 `~/.nova/server-config.json` 的 `server.host / server.port` 决定） |
| 配置来源 | 唯一来源 `~/.nova/server-config.json`；不再读取任何环境变量 |
| 配置文件字段 | `baseUrl`、`auth.internalToken`、`auth.jwtSecret`、`server.host/port`、`database.host/port/user/password/database/sqlLog/sync`、`storage.uploadDir/logDir/uploadToken` |
| 内部令牌 | 所有换取令牌的请求必须携带 `x-nova-token`，与服务端 `auth.internalToken` 一致，否则 401 |
| 换取 JWT | `POST /auth/token`，请求体 `{ userId, username, role }`，返回 `{ token, expiresIn }`（30 天，桌面端由主进程自动续签） |
| 手机端登录 | `POST /auth/mobile-login`，请求体 `{ username, password }`，返回 `{ token, expiresIn, user }`（30 天，避免店员每天重新登录） |
| 业务鉴权 | 业务接口统一携带 `Authorization: Bearer <JWT>`；服务端验签后从载荷读取 `role / sub`，不再接受裸 `x-user-id` / `x-user-role` |
| 角色约束 | `clerk` 访问管理员写接口返回 403；响应体递归裁剪 `cost/costPrice/profit/profitRate/totalCost/grossProfit*`，含 `cost` 时同时裁剪同层 `rate` |
| 健康检查 | `GET /health` 免鉴权，返回 `{ code: 0, data: { status: 'ok', service: 'nova-pos-server', configPath } }` |

桌面端只允许调用白名单端点（`src/main/api/endpoints.ts`，方法 + 路径精确匹配），渲染层无法直接发起任意 HTTP。

---

## 2. 通用约定

- 列表接口统一返回 `{ count, data }`；`count` 为满足条件的总数，`data` 为当前页数组。
- 分页参数：`current`（从 1 开始）、`pageSize`。
- 时间参数为 `YYYY-MM-DD`（含首尾），服务端按当天 00:00:00 ~ 23:59:59 处理。
- 业务错误沿用旧实现：HTTP 200 + `{ error: string }`；桌面端转换为 `NOT_FOUND` / `CONFLICT`。
- 员工密码等敏感字段不再返回；`/user/list` 已剔除 `password`。

---

## 3. 端点清单

### 3.1 订单

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| GET | `/order/queryList` | `start`、`end`、`current`、`pageSize`、`orderType`、`payType`、`orderSn`、`userPhone`、`salerId` | `{ count, data: Order[] }` |
| GET | `/order/queryOrderSummary` | `start`、`end`、`orderType` | `{ orderCount, orderActualAmount, balanceAmount, incomeAmount, itemCount }` |
| GET | `/order/queryDetail` | `orderSn` | `Order` |
| GET | `/order/queryItemList` | `orderSn` | `{ count, data: OrderItem[] }` |
| GET | `/order/queryItemListByDate` | `start`、`end`、`current`、`pageSize` | `{ count, data }`，行内附 `orderCreatedAt`、`orderItemCount`、`orderActualAmount` |
| GET | `/order/queryBySku` | `sku`、`start`、`end` | `{ count, data: OrderItem[] }` |
| GET | `/order/queryOrderRate` | `start`、`end` | 管理员可见毛利率；`clerk` 被裁剪 |
| GET | `/order/queryCouponList` | `start`、`end` | `{ count, data }` |
| POST | `/order/checkBill` | `orderSn` | 对账确认 |
| POST | `/order/modify` / `/order/refundItem` / `/order/changeItem` | 见控制器 | 订单变更 |
| POST | `/order/toggleShow` / `/order/updatePrintStatus` | `orderSn` | 展示 / 打印状态 |

说明：

- D6 新增 `orderType` 过滤。桌面端订单中心固定传 `normal`，排除充值单。
- 订单状态由商品行推导：全部 `refund` → 已退款；存在 `exchangein` → 换货中；否则已完成。

### 3.2 买单

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| POST | `/buy/submit` | `buyer`、`storeSaler`、`waitSales.brief`、`waitSales.list`、`storeCoupons` | 支付回执（订单号、实收、找零等） |
| GET | `/buy/getStoreCoupon` | — | 门店可用券 |

`waitSales.brief` 字段：`counts`、`totalAmount`、`payAmount`、`actualAmount`、`payType`、`remark`。

### 3.3 库存

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| GET | `/inventory/summary` | — | `{ styleCount, stockTotal, soldTotal, brokenStyleCount }`（D6 新增） |
| GET | `/inventory/queryList` | `current`、`pageSize`、`keyword`、`sn` | `{ count, data: Inventory[] }`，`keyword` 模糊匹配 `sn / sku / name` |
| GET | `/inventory/getNoStockList` | `current`、`pageSize`、`keyword` | 断货款列表 |
| GET | `/inventory/getHotSalesList` | `current`、`pageSize`、`minSaleCounts`、`keyword` | 热销款列表（桌面端阈值 2） |
| GET | `/inventory/queryDetailBySku` | `sku` | `Inventory` |
| GET | `/inventory/queryByStyle` | `sn` | SKU 明细 |
| GET | `/inventory/queryTotal` | — | 旧版汇总 |
| GET | `/inventory/skuRecord` | `sku`、`current`、`pageSize` | `{ count, data: StockRecord[] }` |
| GET | `/inventory/records` | `current`、`pageSize` | 全店库存流水（D6 新增） |
| POST | `/inventory/update` | `sku`、`counts` 等 | 写绝对值 |
| POST | `/inventory/create` | 商品字段 | 新建 SKU |

说明：旧库流水没有变动前后库存，桌面端 `before/after` 显示 `—`；库存调整按「读详情 → 写绝对值」实现，负库存跳过。

### 3.4 会员

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| GET | `/member/summary` | — | `{ total, superCount, balanceTotal }`（D6 新增） |
| GET | `/member/list` | `current`、`pageSize`、`keyword`、`level`、`startDate`、`endDate` | `{ count, data: Member[] }`，`keyword` 模糊匹配 `phone / name` |
| GET | `/member/detail` | `phone` | `Member` |
| GET | `/member/queryScoreList` | `phone` | `{ count, data: ScoreRecord[] }` |
| GET | `/member/queryBalanceList` | `phone` | `{ count, data: BalanceRecord[] }` |
| GET | `/member/queryCouponList` | `phone` | `{ count, data: Coupon[] }` |
| POST | `/member/create` / `/member/update` | 会员字段 | 新增 / 编辑 |
| POST | `/member/incomeBalance` | `phone`、`inComeBalance`、`sendValue`、`sendValueType`、`reason`、`payType` | 充值结果 |
| POST | `/member/updateScore` | `phone`、`point`、`reason` | 积分调整 |

桌面端以手机号作为会员稳定 ID。

### 3.5 营销

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| GET | `/marketing/list` | `current`、`pageSize`、`marketingName`、`marketingType`、`startDate`、`endDate` | `{ count, data: Marketing[] }` |
| GET | `/marketing/queryDetail` | `id` | `Marketing` |
| GET | `/marketing/queryCouponList` | `id` | 活动关联券 |
| POST | `/marketing/create` / `/marketing/update` | 活动字段 | 管理员接口 |
| POST | `/marketing/delete` / `/marketing/offline` | `id` | 管理员接口 |
| GET | `/marketing/miniHome` | 无 | `{ data: MiniHomeContent }`，桌面端「营销 - 小程序基础信息 / 小程序 banner / 小程序新品」读取 |
| POST | `/marketing/miniHome` | `MiniHomeContent` | 管理员接口；写入 `~/.nova/mini-content.json`，mall-server `/mini/home`、`/mini/store` 实时读取 |
| POST | `/marketing/uploadImage` | multipart `file`（jpg / png，≤5MB） | 管理员接口；落盘 `~/.nova/storage/mini-image/`，返回 `{ data: { filename } }`，完整地址由桌面端用 `api-config.json` 的 `baseUrl` 拼成 `{baseUrl}/mini-image/{filename}` |

`MiniHomeContent` 结构：`brand`（`name` / `sublabel`）、`banners[]`（`tag` / `title` / `desc` / `cta` / `image` / `link`）、`categories[]`（`name` / `size` / `image`）、`brandStory`（`title` / `slogan` / `desc` / `images[]` / `stats[]`）、`products[]`（`tag` / `name` / `desc` / `price` / `originPrice` / `image`）、`store`（`name` / `address` / `hours` / `phone` / `lat` / `lng` / `image`）。其中 `store` 同时供小程序首页「到店体验」与「我的-门店信息」使用；文件不存在或格式非法时，两端各自回退内置默认值，历史文件缺 `store` 时读取自动补默认门店。

说明：时间筛选为区间重叠（`startTime <= end && endTime >= start`）；旧库没有参与人数 / 核销 / 带动销售数据，桌面端返回 0 或 `—`，不伪造。

积分兑换（桌面端「营销 - 积分兑换」页签）：

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| GET | `/redeem/items` | `current`、`pageSize`、`keyword`、`status`（`active` / `inactive`） | `{ count, data: RedeemItem[] }`，每项附带 `redeemedCount = totalStock - stock` |
| POST | `/redeem/create` | `name`、`image`、`description`、`detail`、`points`、`totalStock`、`perMemberLimit`、`status`、`sort` | 管理员接口；创建时 `stock = totalStock` |
| POST | `/redeem/update` | 同上 + `id` | 管理员接口；总库存按差值同步剩余库存，不得小于已兑数量 |
| GET | `/redeem/orders` | `itemId`（必填）、`current`、`pageSize`、`status`（`pending_pickup` / `picked` / `cancelled` / `expired`，缺省为全部） | `{ count, data: RedeemOrder[] }`，按手机号补 `memberName`；过期未核销的待取货记录读取时判为 `expired` |
| POST | `/redeem/verify` | `id` | 店员可操作；仅 `pending_pickup` 且未过期可核销，原子更新为 `picked` 并写 `pickedAt`，重复核销返回 409 |

`RedeemItem` 字段：`id` / `name` / `image` / `description` / `detail` / `points` / `totalStock` / `stock` / `perMemberLimit` / `status` / `sort` / `createdAt` / `updatedAt`。
`RedeemOrder` 字段：`id` / `orderNo` / `phone` / `memberName` / `itemId` / `itemName` / `itemImage` / `points` / `status` / `pickupCode` / `expiredAt` / `pickedAt` / `requestId` / `createdAt` / `updatedAt`。

### 3.6 数据

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| POST | `/data/getCoreData` | `start`、`end` | `{ orderActualAmount, saledItemCount, orderCount, memberCount, ... }` |
| GET | `/data/getOrderCharts` | `start`、`end` | 订单趋势 |
| GET | `/data/getStoreCharts` | `start`、`end` | 门店汇总 |
| GET | `/data/getStoreDailyCharts` | `year`、`month`（或 `start`/`end`） | 按月日维度数据，`{ code, message }` |

已删除的接口（无消费方）：`/data/analysis`、`/data/getSalerCharts`、`/data/getSalerDailyCharts`。数据中心不提供 AI 归因与导购业绩。

`getCoreData` 的 `saledItemCount` 按区间订单号汇总商品件数，避免把区间外订单计入。

### 3.7 员工与通用

| 方法 | 路径 | 关键参数 | 返回 |
|---|---|---|---|
| GET | `/user/list` | — | `{ count, data: Clerk[] }`，已剔除密码；管理员接口 |
| POST | `/user/login` | `username`、`password` | 旧系统登录 |
| POST | `/user/register` / `/user/update` | 用户字段 | 管理员接口 |
| POST | `/common/uploadFile` | multipart | 文件上传 |
| GET | `/common/opLogs` | `current`、`pageSize` | 操作日志 |

---

## 4. 桌面端字段映射要点

| 服务端 | 桌面端 | 备注 |
|---|---|---|
| `orderSn` | `Order.no` | 同时用于明细查询 |
| `createdAt` | `Order.paidAt` | 裁到分钟 |
| `originalAmount` / `orderAmount` / `orderActualAmount` | `goodsAmount` / 折扣基数 / `amount` | 折扣 = 原价 − 订单金额 |
| `useBalance` / `useCoupon` | `balanceUsed` / `coupon` | |
| `salerName` | `Order.clerk` | 为空显示 `—` |
| `payType` | `PaymentMethod` | `weixin` → `wechat` |
| `Inventory.sn/sku/name` | 列表主信息 | 同款多 SKU 按 `sku` 行展示 |
| `Member.phone` | `Member.id` | 手机号作为稳定主键 |
| `Marketing.startTime/endTime` | 活动状态 | 按时间推导 `upcoming / ongoing / ended` |

---

## 5. 测试与验证

```bash
# 服务端
cd nova-pos-server && npm run typecheck && npm run lint && npm run build

# 换取 JWT
TOKEN=$(node -e "console.log(require(process.env.HOME+'/.nova/server-config.json').auth.internalToken)")
JWT=$(curl -s -X POST http://127.0.0.1:9577/auth/token \
  -H 'content-type: application/json' -H "x-nova-token: $TOKEN" \
  -d '{"userId":"1","username":"linxiao","role":"admin"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

# 冒烟（携带 JWT）
curl -H "authorization: Bearer $JWT" http://127.0.0.1:9577/inventory/summary

# 桌面端端到端（先启动 nova-pos-server，E2E 会从 ~/.nova/server-config.json 复制内部令牌）
cd nova-desktop && npm run test:e2e
```

当前冒烟结果（真实库 `store_pos`）：库存概览 `1202` 款 / `2780` 件 / 已售 `8993`，会员 `1939` 人（超级会员 `17`，余额合计 `3828`），今日普通订单 `22` 单。
