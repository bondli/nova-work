# DaveBella 桌面端 D6 验收报告

> 日期：2026-10-26  
> 范围：服务端迁移（P1）+ 桌面端六大业务页接真实 POS API（D6）  
> 结论：**六大业务页已全部从 mock 切到 nova-pos-server，质量门禁与 E2E 全绿**

---

## 1. 交付内容

| 交付物 | 位置 | 说明 |
|---|---|---|
| POS 服务端 | `nova-pos-server/` | 由 `~/githubProjects/nova/services/storepos-api` 平迁，Express + Sequelize + MySQL |
| 商城服务端 | `nova-mall-server/` | 由 `miniapp-api` 平迁，配置统一到 `~/.nova/mall-config.json`，不再读取环境变量 |
| API 契约 | [api-contract.md](./api-contract.md) | 鉴权、端点、字段映射与限制，D6 冻结 |
| 桌面端接入 | `nova-desktop/src/main/api`、`src/renderer/src/features/*` | 主进程 HTTP 代理 + 渲染层域 API 重写 |
| 验收截图 | `docs/screenshots/d6/` | 7 页 × 两种尺寸 + 关键交互 |

---

## 2. 质量门禁

| 项目 | 命令 | 结果 |
|---|---|---|
| 服务端类型检查 | `nova-pos-server: npm run typecheck` | ✅ 通过 |
| 服务端 Lint | `nova-pos-server: npm run lint` | ✅ 通过 |
| 服务端构建 | `nova-pos-server: npm run build` | ✅ 通过 |
| 商城 Lint | `nova-mall-server: npm run lint` | ✅ 通过 |
| 桌面端类型检查 | `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| 桌面端 Lint | `nova-desktop: npm run lint` | ✅ 0 error（5 个既有 react-refresh warning） |
| 单元测试 | `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| E2E | `nova-desktop: npm run test:e2e` | ✅ 7/7 通过（30.9s） |

E2E 以真实数据库为数据源：临时 `NOVA_HOME` 下的 `server-config.json` 会从真实 `~/.nova/server-config.json` 复制 POS 地址与内部令牌，用例只做只读操作，不写生产库。

---

## 3. 六大业务页接入结果

| 页面 | 真实接口 | 结果 |
|---|---|---|
| 订单 | `/order/queryList`（`orderType=normal`）、`/order/queryOrderSummary`、`/order/queryDetail`、`/order/queryItemList`、`/order/queryItemListByDate`、`/order/checkBill`、`/user/list` | ✅ 列表、汇总、明细抽屉、导购筛选、按日期查商品 |
| 买单 | `/inventory/queryDetailBySku`、`/inventory/queryList`、`/member/list`、`/member/detail`、`/member/queryCouponList`、`/order/queryList`、`/buy/submit`、`/user/list` | ✅ 扫码真实商品、会员搜索与权益、真实员工导购、下单回执 |
| 库存 | `/inventory/queryList`、`/inventory/getNoStockList`、`/inventory/getHotSalesList`、`/inventory/summary`、`/inventory/skuRecord`、`/inventory/records`、`/inventory/update` | ✅ 三档列表、概览、SKU 流水、按绝对值调整库存 |
| 会员 | `/member/list`、`/member/summary`、`/member/detail`、`/member/queryScoreList`、`/member/queryBalanceList`、`/member/queryCouponList`、`/member/incomeBalance` | ✅ 列表与概览、四段详情、充值 |
| 营销 | `/marketing/list`、`/marketing/queryDetail`、`/marketing/offline`、`/marketing/update`、`/marketing/delete` | ✅ 真实活动、状态推导、上下线与删除 |
| 数据 | `/data/getCoreData`、`/data/getOrderCharts`、`/data/getStoreDailyCharts` | ✅ KPI 卡与门店营业额柱状图 |

真实库冒烟（`store_pos`）：

- 库存：`1202` 款 / `2780` 件 / 已售 `8993`；
- 会员：`1939` 人，超级会员 `17`，余额合计 `3828`；
- 订单：今日普通订单 `22` 单；
- 营销：`4` 个活动（含「一周年庆典活动」），默认时间区间拉宽后可全部展示。

---

## 4. 服务端优化项

| 项 | 实现 |
|---|---|
| 内部鉴权 | 内部令牌 `x-nova-token` → `POST /auth/token` 换取 JWT，业务请求统一 `Authorization: Bearer`；服务端只信签名载荷中的角色 |
| 最小权限 | `clerk` 禁止 `/user/list`、营销写接口、毛利率等管理员接口；写接口清单集中在 `ADMIN_ONLY_PREFIXES` |
| 字段裁剪 | 响应递归移除 `cost/costPrice/profit/profitRate/totalCost/grossProfit*`，含 `cost` 时同层 `rate` 一并移除 |
| 敏感字段 | `/user/list` 不再返回 `password` |
| 新增聚合接口 | `/inventory/summary`、`/inventory/records`、`/member/summary` |
| 搜索能力 | 库存 `sn/sku/name`、会员 `phone/name` 统一 `keyword` 模糊匹配；热销新增 `minSaleCounts` |
| 订单过滤 | `queryOrderList` 新增 `orderType`，桌面端排除充值单 |
| 明细补字段 | `queryItemListByDate` 增加 `orderCreatedAt`、`orderItemCount` |
| 指标修正 | `getCoreData.saledItemCount` 改为按区间订单号汇总商品件数 |
| 清理死代码 | 删除 `/data/analysis`、`/data/getSalerCharts`、`/data/getSalerDailyCharts` |

未实现（明确留到后续阶段）：写接口幂等键、操作审计日志落库。

---

## 5. 桌面端架构

- 主进程新增 [pos-client.ts](../nova-desktop/src/main/api/pos-client.ts)：10s 超时、方法 + 路径白名单、JWT 注入、HTTP 状态映射（401/403/404/409）、HTTP 200 内 `{ error }` 业务错误转换；401 时自动续签并重试一次。
- IPC 单一通道 `pos:request`（zod 校验 `method/path/query/body`），渲染层经 [pos.ts](../nova-desktop/src/renderer/src/lib/pos.ts) 的 `posGet/posPost` 调用，并对 `undefined` 查询参数做剔除。
- 服务端地址、内部令牌、数据库与目录全部来自 `~/.nova/server-config.json`（数据设置页可维护），主进程内部请求即时使用该配置。
- 六个域 API（orders / buy / inventory / members / marketing / analytics）各自完成服务端字段 → 视图模型映射，页面不再直接依赖服务端字段名。
- 删除 `features/buy/mock-buy.ts`、`features/orders/mock-orders.ts`，移除 mock 导购常量。

---

## 6. E2E 用例

| # | 用例 | 覆盖点 | 结果 |
|---|---|---|---|
| 1 | 未登录调用业务 IPC 被拒绝 | 会话缺失时返回 `UNAUTHENTICATED` | ✅ |
| 2 | 错误密码与登录成功 | 错误提示 + 管理员进入经营分析 | ✅ |
| 3 | 注册默认导购员 | 新账号 clerk，任务时间只读 | ✅ |
| 4 | 导航冒烟与双尺寸截图 | 7 页切换、性能计时、1440×900 / 1280×800 | ✅ |
| 5 | 业务页关键交互 | 买单扫码 `6941496121586` → 「内衣」入清单；会员搜索 `15906536862`；订单明细；会员详情（四段）；营销列表；数据近 7 天 | ✅ |
| 6 | 通知闭环与设置保存 | 红点 → 已读跳转；任务时间写入 `settings.json` | ✅ |
| 7 | 经营分析流式与产物 | 本地假 SSE：流式文本 → 工具调用 → 产物预览 | ✅ |

E2E 只读约束：营销页仅断言活动行存在，不执行上下线/删除，避免污染生产库。

---

## 7. 性能数据

采集于 1440×900、macOS arm64、生产构建（`test-results/d6-perf.json`）。

| 指标 | 数值 |
|---|---|
| 启动到登录页可见 | 610 ms |
| 登录到经营分析 | 142 ms |
| 导航 analysis / buy / orders | 536 / 570 / 559 ms |
| 导航 inventory / members / marketing / data | 572 / 576 / 565 / 560 ms |

---

## 8. 截图清单

`docs/screenshots/d6/`：

- 双尺寸：`d6-{analysis,buy,orders,inventory,members,marketing,data}-{1440,1280}.png`
- 关键交互：`d6-buy-scan.png`、`d6-buy-member-search.png`、`d6-orders-detail.png`、`d6-members-detail.png`、`d6-marketing-list.png`、`d6-data-7d.png`
- 登录 / 通知 / 设置：`d6-login-1440.png`、`d6-notification-menu.png`、`d6-notification-jump.png`、`d6-settings-clerk.png`、`d6-task-settings.png`
- 经营分析：`d6-analysis-artifact.png`

---

## 9. 已知限制

1. 旧库没有库存流水的前后库存、会员最近到店、活动参与 / 核销 / 带动销售数据，桌面端显示 `—` 或 0，不伪造。
2. 买单页「整单折扣」「打印小票」、会员新增 / 编辑、活动编辑仍为占位提示，留待后续阶段。
3. 服务端写接口尚无幂等键与审计日志。
4. `/data/getStoreDailyCharts` 仍需按月逐个请求，区间较长时数据页首屏耗时随月份数线性增长。

---

## 10. 后续加固（2026-10-27）

| # | 问题 | 处理 |
|---|---|---|
| 1 | 设置弹窗淡入与修改密码弹窗不一致 | 弹窗内容延后一帧挂载，先让弹窗壳完成首帧淡入，避免重内容阻塞导致动画跳变 |
| 2 | 模型设置、数据设置空白 | 新增 `ModelSettingsTab`（读写 `~/.nova/agent-config.json` 的 `model` 段）与 `DataSettingsTab`（读写 `~/.nova/server-config.json`），均仅管理员可用 |
| 3 | 服务端依赖环境变量 | POS 与商城服务端全部改为配置文件（`server-config.json` / `mall-config.json`），移除 `DB_*`、`PORT`、`HOST`、`NOVA_CONFIG_PATH`、`NOVA_INTERNAL_TOKEN`、`WECHAT_*`、`UPLOAD_DIR`、`PUBLIC_BASE_URL`、`MALL_UPLOAD_API_KEY`、`NODE_ENV`、`DB_SYNC`、`SQL_LOG` |
| 4 | 登录鉴权存在越权风险 | 引入 JWT：内部令牌换取 12 小时签名令牌，服务端只信载荷中的角色；桌面端 JWT 仅存主进程内存，401 自动续签 |
| 6 | 空态图标带圆角背景且偏小 | 移除圆角背景容器，图标由 `20px` 放大到 `40px` |

---

## 11. 登录改造与页面一致性对齐（2026-10-27）

### 11.1 登录改走 POS 服务

- 渲染层不再本地存储或硬编码用户，登录 / 注册全部走 nova-pos-server：
  - `POST /user/login`：校验账号密码，成功后返回用户信息（含 `role`）。
  - `POST /user/register`：公开自助注册，默认 `role=clerk`、`status=normal`，由店长在后台改角色 / 停用。
- 两个接口挂在 `internalAuth` 之前，只校验内部令牌 `x-nova-token`，避免「登录前无 JWT」死结；业务接口仍需 Bearer JWT。
- 密码格式升级为 `scrypt$salt$hash`；兼容历史明文，首次成功登录后自动升级为哈希。已实测 `admin` / `lly` 升级为 `scrypt$...`。

### 11.2 数据表调整（已执行）

老库 `User` 表缺少 `role`、`realName`，且 `password` 长度不足以容纳哈希。执行前后 `User` 表结构如下：

| 字段 | 变更 |
|---|---|
| `role` | 新增 `VARCHAR(16) NOT NULL DEFAULT 'clerk'` |
| `realName` | 新增 `VARCHAR(32) NULL` |
| `password` | `VARCHAR` 扩容以容纳 `scrypt$salt$hash` |
| `name` | 补唯一索引，注册时防重名 |

```sql
-- 0. 备份（GTID 模式下禁止 CREATE TABLE ... SELECT，改用 LIKE + INSERT SELECT）
CREATE TABLE User_backup_20261027 LIKE User;
INSERT INTO User_backup_20261027 SELECT * FROM User;

-- 1. 角色：admin 管理员 / clerk 导购员
ALTER TABLE User ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'clerk' AFTER password;

-- 2. 姓名
ALTER TABLE User ADD COLUMN realName VARCHAR(32) NULL AFTER name;

-- 3. 密码列扩容，容纳 scrypt$salt$hash
ALTER TABLE User MODIFY password VARCHAR(255) NOT NULL DEFAULT '123456';

-- 4. 现有管理员置为 admin（其余保持 clerk）
UPDATE User SET role = 'admin' WHERE name = 'admin';

-- 5. 用户名唯一，注册防重名
ALTER TABLE User ADD UNIQUE KEY uk_user_name (name);
```

> 备份表名：`User_backup_20261027`。回滚方式：`DROP TABLE User; RENAME TABLE User_backup_20261027 TO User;`

### 11.3 表格字段与操作项对齐

以老系统 `/Users/bondli/githubProjects/nova/...` 的 `table-render` 列定义为基准逐页对齐：

| 页面 | 对齐点 |
|---|---|
| 订单 | 列顺序与文案：订单号 / 商品数量 / 应付金额 / 实付金额 / 支付方式 / 会员 / 时间 / 导购员 / 对账状态 / 打印；操作补齐「详情 / 修改 / 更多（打印小票 / 退货 / 换货）」；新增「修改订单」弹窗 |
| 订单商品 | 列改为 订单号 / 实付金额 / 条码 / 数量·状态 / 尺码·颜色 / 实付金额，订单号与实付金额跨行合并 |
| 对账 | 列补齐 会员 / 打印状态 / 有效状态，操作补齐「确认到账」「置为无效 / 恢复正常」 |
| 库存 | 列改为 款号 / 条码 / 名称 / 颜色 / 尺码 / 吊牌价 / 成本价 / 库存 / 销量；操作补齐「详情 / 编辑 / 流水」，款号色块点击预览商品图片；筛选拆为 条码 / 款号 / 商品名称 / 品牌 / 排序 |
| 会员 | 列表与「新增 / 编辑」弹窗对齐老系统字段 |
| 营销 | 列与「详情 / 编辑 / 新增 / 抽奖查询」对齐；无数据列（参与 / 核销 / 带动销售）保留并显示 `—` |
| 数据 | KPI 文案 订单金额(CNY) / 余额消耗 / 订单数量 / 售出商品 / 商品库存 / 会员余额(CNY)；按天汇总改为 销售额 / 成本 / 利润率 |
| 操作日志 | 列补齐「系统 / 版本」（缺省显示 `—`）；筛选文案 操作时间 / 操作类型；底部仅「关闭」 |
| 买单 | 待售清单列改为 商品 / 颜色 / 尺码 / 单价 / 折扣 / 数量 / 小计 / 操作；汇总改为 待售 N 款·M 件 / 原价 / 优惠 / 应付；侧栏补齐 本月生日、会员/店铺优惠券分行、账单明细；确认收款改为弹窗 |

「类型 / 列名冲突」一律按老系统文案（实付金额、吊牌价、成本价、销量）。

### 11.4 主进程白名单补充

为让会员抽奖查询与买单「本月生日」走真实接口，`src/main/api/endpoints.ts` 增补三条服务端已有路由：

- `GET /member/queryBigdayCouponList`
- `GET /member/queryDrawRecord`
- `POST /member/submitUserDrawed`

### 11.5 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test:e2e` | ✅ 8/8 通过（40.6s） |

E2E 修复：库存编辑弹窗的库存字段断言改为按弹窗作用域定位（`getByRole('dialog', { name: '编辑库存' }).getByRole('spinbutton', { name: '库存 *' })`），避免与左侧「库存」导航同名造成 strict mode 冲突。

---

## 12. 交互与密度优化（2026-10-27）

### 12.1 表单与筛选

| # | 页面 | 调整 |
|---|---|---|
| 1 | 全局 | `Input` / `Textarea` 字号由 `text-base`（14px）改为 `text-ui`（12px），placeholder 与输入值同字号，与日期区间选择器一致 |
| 2 | 订单 | 「会员」「订单号」两个输入框合并为「订单号 / 会员手机」单框；提交时按 11 位纯数字判定为手机号，仅给 `userPhone` 赋值，否则给 `orderSn` 赋值 |
| 3 | 库存 | 去掉「品牌」筛选；「款号」「商品名称」合并为「款号 / 商品名称」单框，提交走服务端 `keyword`（在 款号 / 条码 / 名称 之间取「或」匹配，等价于款号或名称的 or 条件）；去掉「排序」下拉，改为表头点击排序 |
| 4 | 会员 | 去掉「排序」下拉，改为表头点击排序（积分 / 余额） |

表头排序由 `DataTable` 统一提供：列声明 `meta.sortKey`（服务端排序字段）后表头渲染排序按钮，三态循环 升序 → 降序 → 默认，并把 `${key} ${order}` 写入 `orderby` 后回到第一页。

### 12.2 抽屉与弹窗

| # | 页面 | 调整 |
|---|---|---|
| 5 | 营销 | 「新增 / 修改营销活动」由 Dialog 改为右侧 `SheetDrawer`（宽 640），信息分区块展示，页脚「关闭 / 确定」通过 `form` 属性关联表单 |
| 6 | 订单 / 库存 | 「修改订单」「编辑库存」弹窗重排：顶部图标 + 标题，字段按「订单信息 / 会员与备注」「商品信息 / 调整后库存」分区块，库存弹窗展示调整前后差值；底部按钮由「确定 / 重置」改为「确定 / 关闭」 |
| 8 | 对账 | 抽屉宽度 640 → 980，消除横向拖动；去掉顶部「导出」与底部「全部确认」（保留每行「确认到账」） |
| 7 | 订单详情 | 去掉顶部「导出」 |

### 12.3 状态与流水

| # | 页面 | 调整 |
|---|---|---|
| 9 | 订单 / 对账 | 「打印状态」用 `StatusBadge` 呈现：已打印绿色（success）、未打印黄色（warning），与「对账状态」样式一致 |
| 10 | 库存 | 「商品流水」抽屉对齐老系统 `Inventory/SkuRecord`：顶部条码输入框 + 查询；列改为 商品 / 变动类型 / 变动数量 / 变动明细 / 变动时间，变动数量出库为负、入库为正并按正负着色 |
| 11 | 库存 | 列表操作列去掉「流水」（保留顶部「商品流水」入口）；详情抽屉对齐老系统 `Inventory/Detail`，宽度 520 → 720，新增「该款下 SKU 列表」（条码 / 颜色 / 尺码 / 库存 / 销量） |

### 12.4 缺陷修复

订单「订单商品」抽屉查询不到商品：渲染层调用的是 `/order/queryItemListByDate`，而服务端路由为 `/order/queryOrderItemListByDate`，路径不匹配导致请求 404。已同步修正渲染层调用与主进程白名单（`src/main/api/endpoints.ts`）。

### 12.5 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run build` | ✅ 通过 |
| `nova-desktop: npx playwright test` | ✅ 8/8 通过（40.5s） |

`demo/desktop.html` 同步以上交互（输入框字号、订单筛选合并、库存筛选与表头排序、会员表头排序、营销抽屉、编辑弹窗、打印徽标、对账抽屉、商品流水抽屉、库存详情 SKU 列表）。

---

## 13. 会员、营销与导出对齐（2026-10-27）

### 13.1 列表与筛选

| # | 页面 | 调整 |
|---|---|---|
| 1 | 会员 | 列表去掉「最近到店」列；「等级」列移到「创建时间」之前，列序变为 手机号 / 姓名 / 实付 / 积分 / 余额 / 优惠券 / 等级 / 创建时间 / 操作 |
| 3 | 会员 / 营销 | 去掉筛选条上的「刷新」按钮，列表数据由查询条件与 mutation 成功后自动失效重取 |
| 5 | 订单 | 「时间」列去掉年份，只保留 `MM-DD HH:mm`（`shortPaidAt`），完整时间仍在详情抽屉展示 |

### 13.2 抽屉与弹窗

| # | 页面 | 调整 |
|---|---|---|
| 2 | 会员 | 「新增会员」弹窗的「重置」改为「关闭」；生日由原生 `type="date"` 换成 `Popover + Calendar`（shadcn 日历，含年/月下拉），值统一为 `YYYY-MM-DD` |
| 6 | 库存 | 详情抽屉去掉左侧展示商品名首字的色块，`dl` 栅格占满整行 |
| 7 | 会员 | 详情抽屉「基础信息」改为与库存详情一致的 `dl` 两列栅格（`gap-px` + 底色分隔），底部信息行去掉「最近到店」 |
| 8 | 会员 | 「编辑会员」由 Dialog 改为右侧 `SheetDrawer`，可修改项对齐老系统 `Member/Editor`：基本信息（手机号只读 / 姓名 / 生日）、积分（当前积分只读 / 变动积分 / 变动类型 / 变动原因）、余额（当前余额只读 / 变动金额 / 变动类型 / 变动原因）。积分与余额仍仅管理员可见可提交 |
| 9 | 营销 | 活动详情抽屉「基础信息」改为与库存详情一致的 `dl` 两列栅格，标题与状态徽标同行两端对齐 |

### 13.3 订单商品导出对齐老系统

老系统 `Order/OrderItemList` 的导出是调用服务端 `POST /order/exportOrderItemList`，由服务端 `exceljs` 生成 xlsx 后回传，而非前端拼 CSV。桌面端原先用本地 `downloadCsv` 导 CSV，列与格式均不对齐。

处理：

- 新增主进程导出通道 `pos:export`（[pos.ts](../nova-desktop/src/main/ipc/pos.ts)）：渲染层只传 `path / body / filename`，主进程带 JWT 请求服务端 → 取回二进制 → 弹保存对话框 → 落盘，返回 `filePath`（取消为 `null`）。
- [pos-client.ts](../nova-desktop/src/main/api/pos-client.ts) 新增 `posExportFile`，复用端点白名单校验与 401 自动续签，导出超时单独放宽到 60s。
- 白名单补充 `POST /order/exportOrderItemList` 与 `POST /member/updateBalance`。
- 渲染层 `posExport` 替换 `downloadCsv`，导出文件名对齐老系统：`订单商品[${start}~${end}].xlsx`；确认已无引用的 `lib/csv.ts` 已删除。

### 13.4 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过 |
| `nova-desktop: npm run test:e2e` | ✅ 8/8 通过（39.7s） |

`demo/desktop.html` 同步以上改动（会员列序、会员详情与营销详情栅格、库存详情去色块、订单时间去年份、营销去刷新、导出改 xlsx 文案、新增会员编辑抽屉），内联脚本已通过 `node --check`。

---

## 14. 错误可读性与导购员口径（2026-10-27）

### 14.1 服务端未启动时的错误提示

问题：POS 服务端未启动时，界面只显示「加载失败 / fetch failed」，无法判断是服务没起、地址写错还是网络不通。

根因：主进程把所有连接层失败都归为 `INTERNAL_ERROR`，并原样透传 undici 的 `TypeError('fetch failed')`。令牌换取（`pos-token.ts`）是最先失败的一层，它先把原始错误包成了 `INTERNAL_ERROR`，导致上层再也拿不到 `error.cause.code`。

处理：

- [pos-errors.ts](../nova-desktop/src/main/api/pos-errors.ts) 新增 `toNetworkError`，读取 `error.cause.code` 翻译为 `SERVICE_UNAVAILABLE`，并在 `cause` 缺失时以 `fetch failed` 兜底。
- 三处调用点统一接入：`pos-request`（业务请求）、`posExportFile`（导出）、`fetchToken`（换取 JWT），登录 / 注册 / 修改密码同样复用。

| cause.code | 提示 |
|---|---|
| `ECONNREFUSED` | 无法连接 POS 服务端（{baseUrl}）：连接被拒绝，请先启动 nova-pos-server 后重试 |
| `ENOTFOUND` / `EAI_AGAIN` | 无法解析 POS 服务端地址（{baseUrl}），请检查「设置 → 数据设置」中的服务地址 |
| `ETIMEDOUT` / `UND_ERR_CONNECT_TIMEOUT` | 连接 POS 服务端超时（{baseUrl}），请检查网络或服务端状态 |
| `ECONNRESET` | 与 POS 服务端的连接被重置（{baseUrl}），请稍后重试 |
| `AbortError` | 各调用点自定义超时文案（请求 / 导出 / 换取令牌） |

实测（临时用例，验证后已删除）：把 POS 地址指向 `127.0.0.1:19999`，会员页错误区展示为
`无法连接 POS 服务端（http://127.0.0.1:19999）：连接被拒绝，请先启动 nova-pos-server 后重试`，页面无 `fetch failed` 字样。

### 14.2 导购员列表口径

接口 `/user/list` 原先直接返回全表：含管理员、含 `status=disabled` 的账号，且界面展示登录用户名。

处理（[orders/api.ts](../nova-desktop/src/renderer/src/features/orders/api.ts) 的 `fetchClerks` 作为唯一来源）：

- 过滤 `role === 'admin'` 与 `status === 'disabled'`，只保留在职导购。
- `Clerk` 增加 `username`（登录名）与 `name`（展示名）：`name` 取真实姓名 `realName`，为空时回退用户名。
- 下单提交的 `storeSaler.name` 随之变成真实姓名；服务端 `modifyOrder` 写 `salerName` 也改为 `realName || name`。
- 订单列表 / 详情按 `salerId` 映射为当前真实姓名，历史订单里存的用户名也会显示为真实姓名；导购员无权限读员工表时静默跳过映射，保留原值。
- 订单筛选的「导购员」由按姓名匹配改为直接传 `salerId`，避免同名导购合并；`OrderFilters.clerk` 语义改为导购 ID（空串为全部）。
- 买单默认导购：员工表加载后优先匹配登录人（按 `username`），否则取第一位在职导购；管理员不会再被选为导购。
- 删除重复且已无引用的 `members/api.ts#fetchSalers`、`useSalersQuery`、`buy/api.ts#loadClerks`。

实测（临时用例，验证后已删除）：导购下拉选项为 `丁希梅 | 刘凌艳`，`王晓丽`（disabled）与 `李小猪`（admin）均未出现；默认值为 `丁希梅`。

### 14.3 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过 |
| `nova-desktop: npm run test:e2e` | ✅ 8/8 通过（35.9s） |
| `nova-pos-server: npm run build` | ✅ 通过（已重启，指向备用库 `store_pos_backup261027`） |





---

## 15. 订单、会员与库存细节对齐（2026-10-27）

### 15.1 订单

- 订单中心默认查询区间由近 30 天改为**当天**；「订单商品」抽屉独立使用**近 7 天**默认区间，不再跟随列表页。
- 有备注的订单编码保持颜色区分，并新增 hover Tooltip 展示完整备注；`TooltipProvider` 挂在应用根部。
- 修改订单弹窗对齐「编辑库存」样式：宽度 520px、图标标题、分区圆角描边、支付方式与导购员下拉 `w-full` 铺满栅格。
- 不可修改字段禁用：非管理员不可改导购员（对齐老系统）；**已完成对账（`orderStatus=checked`）的订单仅备注可编辑**。订单视图模型新增 `checked` 字段承载该状态。

### 15.2 会员

- 充值弹窗补齐老系统字段：**赠送类型**（现金余额 / 商品吊牌价值）、**变动原因**、**成单导购员**（在职导购、提交时带真实姓名）；支付方式顺序与文案沿用统一常量。
- 会员详情抽屉去掉底部「编辑」「充值」按钮，行内操作仍保留。
- 新增/编辑会员的日历年月下拉去掉输入框式边框（`dropdown_root` 改为 `border-0 shadow-none`）。

### 15.3 库存与系统

- 商品流水抽屉去掉「查询」按钮：条码输入满 13 位自动查询，输入过程中按回车同样触发。
- 操作日志弹框去掉底部「关闭」按钮及整块底部区域。
- 暗黑模式下 `input[type=time]` 的原生图标做反色处理，右侧图标可见。
- 支付方式文案收敛为单一常量 [payment.ts](../nova-desktop/src/renderer/src/lib/payment.ts)：订单、买单、会员充值共用，订单筛选的「微信支付 / 刷卡」统一为「微信 / 银行卡」。

### 15.4 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过 |
| `nova-desktop: npm run test:e2e` | ✅ 8/8 通过（34.5s） |

`demo/desktop.html` 已同步订单默认当天、订单商品近 7 天、修改订单样式、会员充值弹窗、会员详情去底部按钮、商品流水自动查询、操作日志去底部区域。

---

## 16. 对账、条码复制、输入清空与分析口径（2026-10-27）

### 16.1 对账状态统一

- 订单列表「对账状态」原先误用了订单状态（已完成 / 已退款 / 换货中），与对账抽屉的 已对账 / 未完成对账 不一致；现改为按 `Order.checked` 渲染。
- 新增 [ReconcileStatusBadge.tsx](../nova-desktop/src/renderer/src/features/orders/ReconcileStatusBadge.tsx)，列表与对账抽屉共用，文案统一为 **已对账 / 未对账**；抽屉保留勾选图标。
- `labels.ts` 中不再使用的 `ORDER_STATUS_LABEL` / `ORDER_STATUS_TONE` 一并删除。

### 16.2 条码复制

- 新增 [CopyText.tsx](../nova-desktop/src/renderer/src/components/common/CopyText.tsx)：`CopyButton` 写入剪贴板并短暂显示对勾，`CopyableText` 为「文本 + 复制图标」组合。
- 覆盖位置：库存列表条码列、库存详情条码字段与同款 SKU 列表、编辑库存的只读条码、订单详情商品条码、订单商品抽屉条码列、商品流水条码列。

### 16.3 文本输入框一键清空

- [input.tsx](../nova-desktop/src/renderer/src/components/ui/input.tsx) 统一改造：仅当 `type` 为 `text`（或未指定）、受控、非禁用/只读且值非空时，最右侧出现 `×`，点击清空。
- `number / date / time / password` 等类型保持原生行为，避免影响数值、日期与密码输入。
- 外层包装只复用调用方的尺寸类（`w-* / flex-*` 等），避免固定宽度筛选框被拉满或内边距重复。

### 16.4 AI 经营分析

- 智能分析工具的 SQL 去掉 `showStatus = 'normal'` 过滤（经营概览、毛利率、销售趋势、订单明细、导购业绩五处），定时生成的每日经营分析不再忽略 `showStatus = 'hidden'` 的订单。
- [prompt.ts](../nova-desktop/src/main/agent/prompt.ts) 口径同步为：有效订单 = `orderStatus <> 'refund'`（不排除 hidden）。
- 用户消息 hover 时间：当天显示 `HH:mm`；同年非当天显示 `MM-dd HH:mm`；跨年显示 `yyyy-MM-dd HH:mm`。

### 16.5 会员生日年份

- 新增/编辑会员的生日日历，年份下拉下限由 1930 改为 **2012**，上限保持当前年份；历史生日早于 2012 时打开默认停在 2012-01，不会出现更早年份。

### 16.6 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过（`test:e2e` 前置构建） |
| `nova-desktop: npm run test:e2e` | ✅ 8/8（首轮 navigation 用例因登录服务瞬时不可用超时，单独重跑通过） |

`demo/desktop.html` 已同步订单列表与对账抽屉的「已对账 / 未对账」文案，以及用户消息 hover 时间的日期展示；条码复制与输入框清空属于交互增强，静态预览未逐处模拟。

---

## 17. 单件新增、会员列表与写接口 query 修复（2026-10-27）

### 17.1 库存「单件新增」对齐老系统

- 新增 [SingleStockDialog.tsx](../nova-desktop/src/renderer/src/features/inventory/SingleStockDialog.tsx)，字段与必填项对齐老系统 `Inventory/SingleStock`：**款号 / 名称 / 品牌 / 条码 / 颜色 / 尺码 / 吊牌价 / 成本价 / 库存**。
- 库存页工具栏新增「单件新增」主按钮（仅管理员可见，与老系统一致），提交走 `POST /inventory/create`，成功后写入库存并生成「单品入库」流水。
- 「批量操作」下拉移除原来的「单个入库」，只保留批量入库 / 批量退库，避免与单件新增重复。

### 17.2 会员列表

- 姓名前的圆形色块头像移除，只保留姓名文本。
- 手机号旁新增复制图标（复用 `CopyableText`），点击一键复制。

### 17.3 写接口 query 丢失（确认到账 / 营销上线）

- 根因在 [pos-client.ts](../nova-desktop/src/main/api/pos-client.ts)：POST 请求原先不拼接 query，而老系统多个写接口从 query 读取主键：
  - `POST /order/checkBill` 需要 `orderSn`，缺失导致「确认到账」不生效；
  - `POST /marketing/update` 需要 `id`，缺失导致进行中/已结束活动「上线」返回 `Marketing not found`；
  - `POST /order/modify` 的 `orderId`、`POST /inventory/update` 的 `sku` 同样受影响。
- 现 GET / POST 统一拼接 query，上述写接口恢复正常。

### 17.4 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过（`test:e2e` 前置构建） |
| `nova-desktop: npm run test:e2e` | ✅ 8/8 通过（36.1s） |

`demo/desktop.html` 已同步库存「单件新增」按钮与弹窗、会员列表去头像及手机号复制图标。

---

## 18. 单件新增按钮、AI 消息字号与营销下线状态（2026-10-27）

### 18.1 库存「单件新增」弹窗

- 底部「重置」改为「关闭」，关闭（含右上角 ×、Esc）时清空表单，避免下次打开残留上一次输入。

### 18.2 字号设置对 AI 分析消息生效

- 新增语义字号 `--text-message`（基准 14px × `--font-scale`），消息气泡、流式预览与 Markdown 正文统一改用 `text-message`。
- Markdown 的标题、表格、代码块改为 `em` 相对字号，随字号设置等比缩放。
- `tailwind-merge` 已注册 `message` 字号，避免与 `text-primary-foreground` 等颜色类合并时被误删。

### 18.3 营销下线后状态未更新

- 根因在 [marketing/api.ts](../nova-desktop/src/renderer/src/features/marketing/api.ts)：状态判断把 `endTime` 补成当天 `23:59:59`，而下线接口写入的是「当前时刻」，导致下线后仍判定为进行中。
- 现直接用服务端返回的完整时间戳比较，下线后列表与详情立即显示「已结束」。
- 同时修正「上线」入口的状态判断：进行中/未开始的活动不会再被误判为已结束而走重排期分支。

### 18.4 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过 |
| `nova-desktop: npx playwright test` | ✅ 8/8 通过（35.0s） |

E2E 顺带修正订单「详情」选择器：金额列的「优惠使用详情」按钮会先匹配到，改为 `exact: true` 精确匹配操作列按钮。`demo/desktop.html` 已同步「关闭」按钮。

---

## 19. 买单体验、订单打印/退换货与批量出入库（2026-10-27）

### 19.1 买单页交互与展示

- 扫码框输入满 **13 位**条码自动查询；输入任意内容后回车也会查询，两者共用同一查询逻辑，查询中不重复触发。
- 待售商品数量改为普通数字输入框（[QuantityInput.tsx](../nova-desktop/src/renderer/src/features/buy/QuantityInput.tsx)），失焦或回车提交，最少 1 件；原加减步进器移除。
- 折扣输入框由 56px 放宽到 80px，`6.0 折` 可完整展示。
- 右侧「整单折扣」行移除。
- 「确认收款」不再弹二次确认框，直接执行原有的金额校验与下单接口。
- 账单明细中的「订单应收 / 订单应付」两行上移到「应收金额」区域；金额统一由 `formatMoney` 输出，修复原先 `¥¥` 重复符号。

### 19.2 订单打印小票

- 新增 [OrderPrintSheet.tsx](../nova-desktop/src/renderer/src/features/orders/OrderPrintSheet.tsx)：抽屉内以 58mm 版式预览小票，底部「打印小票」调用系统打印。
- 新增 [receipt.ts](../nova-desktop/src/renderer/src/lib/receipt.ts)，版式对齐老系统 `components/Bill`：门店、订单信息、商品明细、应收/积分/券/余额抵扣、实收、会员权益与页脚。
- 新增主进程打印 IPC [print.ts](../nova-desktop/src/main/ipc/print.ts)：把 HTML 放进隐藏 BrowserWindow，通过 `webContents.print` 调起原生打印；打印成功后回写 `POST /order/updatePrintStatus`（`printStatus: printed`），列表与详情同步刷新。

### 19.3 订单退货

- 新增 [OrderRefundSheet.tsx](../nova-desktop/src/renderer/src/features/orders/OrderRefundSheet.tsx)，对齐老系统 `Order/MoreOperate/Refund`：
  - 勾选退货商品、确认每条退回数量（默认全退，限制 1~售出数量）；
  - 输入退货金额，订单使用余额时可选「退实付金额 / 退账户余额」；
  - 提交 `POST /order/refundItem`（`orderSn / refundAmount / amountType / refundItems`），成功后刷新订单域。

### 19.4 订单换货

- 新增 [OrderExchangeSheet.tsx](../nova-desktop/src/renderer/src/features/orders/OrderExchangeSheet.tsx)，对齐老系统 `Order/MoreOperate/Exchange`：
  - 选择退回商品并确认数量；
  - 扫码 / 输入条码查询换出商品（满 13 位自动查询、回车查询），展示吊牌价、6 折销售价、数量，可移除；
  - 选择价差类型（补差价 / 退差价 / 无价差）并输入金额；订单使用过余额且退差价时，可勾选「差价退回余额」；
  - 提交 `POST /order/changeItem`（`returnItems / exchangeItems / exchangeAmount / amountType / refundBalance`）。
- 列表「更多」与详情抽屉的打印 / 退货 / 换货入口均已接通；打开操作抽屉前会关闭详情，避免叠加。

### 19.5 库存批量入库 / 批量退库

- 重写 [BatchStockDialog.tsx](../nova-desktop/src/renderer/src/features/inventory/BatchStockDialog.tsx)，对齐老系统 `Inventory/BitchStock` 的 Excel 流程：
  - 「下载模板」走 `POST /inventory/template`，入库模板含品名/货号/条码/尺码/颜色/吊牌价/进货价/数量/品牌，退库模板含条码/数量；
  - 「选择 Excel 文件」由主进程弹原生文件框并上传 `/common/uploadFile` 解析；
  - 入库先校验表头，再调用 `POST /inventory/batchProcessPurchaseData` 预览，显示新款 / 补款 / 补货标记；提交前检查重复条码；
  - 退库调用 `POST /inventory/batchProcessReturnsData` 合并同条码数量并回填库存，再提交；
  - 填写采购 / 退货单号后调用 `POST /inventory/batchCreate` 或 `POST /inventory/batchReturns`，结果提示成功与失败数量，并刷新库存与流水。
- 新增主进程上传 IPC（`pos:upload`）与渲染层 [posUploadFile](../nova-desktop/src/renderer/src/lib/pos.ts)，上传接口继续走统一鉴权、401 重试与业务错误映射。
- 删除原「SKU 文本域 + 统一数量」的人工调整实现与 `StockMovementInput`。

### 19.6 验证

| 项目 | 结果 |
|---|---|
| `nova-desktop: npm run typecheck` | ✅ node + web 通过 |
| `nova-desktop: npm run lint` | ✅ 0 error（6 个既有 react-refresh warning） |
| `nova-desktop: npm run test` | ✅ 7 文件 / 42 用例 |
| `nova-desktop: npm run build` | ✅ 通过 |
| `nova-desktop: npm run test:e2e` | ✅ 8/8 通过（38.5s） |

## 20. P5 手机端（nova-mobile）

> 阶段归属：`implementation-plan.md` §14 的 **P5**。桌面端 D6 已完成，本节记录手机端首次落地。

### 20.1 工程与登录

- 新建 `nova-mobile`：Expo SDK 58 + React Native 0.88 + React 19 + expo-router + TypeScript strict（`noUncheckedIndexedAccess` / `noImplicitOverride`）。
- 目录：`app/` 路由（登录、5 Tab、订单/库存/会员详情、收款、成功页、我的）+ `src/lib`（`api` / `money` / `pricing` / `format` / `storage` / `pos`）+ `src/stores`（`auth` / `cart`）+ `src/components/ui` + `src/theme`。
- 应用名 `DaveBella`，包名 `com.davebella.nova`，scheme `davebella`；相机权限文案已配置。
- 手机端不持有内部令牌：服务端新增 `POST /auth/mobile-login`（账号口令校验 + 直接签发 JWT），并加 `createRateLimit`（同 IP + 账号 5 分钟 10 次）；实现位于 `nova-pos-server/src/middleware/rate-limit.ts` 与 `src/router/auth-controller.ts`。
- 会话（服务地址 / token / 用户）存 `expo-secure-store`；401 统一清除会话并跳登录；服务地址默认 `http://127.0.0.1:9577`，登录页与「我的」可改（仅管理员在「我的」修改）。

### 20.2 功能范围

- **5 Tab**：订单 / 库存 / 买单 / 会员 / 数据，无营销。
- **买单**：扫码（expo-camera）与手输条码（满 13 位自动查询、回车查询）、待售清单数量步进与单品折扣、会员搜索（积分/余额/券）、店铺券、积分/余额开关、应收实时计算、支付方式 + 实收快捷金额、现金找零、导购员与备注、提交后成功页展示找零/积分/余额；失败保留清单可重试。
- **订单**：今日/近 7 天/近 30 天 + 订单号/手机号查询、订单详情（商品/优惠/支付/会员）、标记打印、退货（按商品行数量、原路退款或退回余额）、换货（退回商品 + 扫码换出商品 + 自动价差方向）。
- **库存**：全部/断码/热销、关键字查询、商品详情、同款尺码库存矩阵、库存流水。
- **会员**：概览（总数/超级会员/余额合计）、搜索、详情（积分/余额/券流水）、充值（含赠送金额，赠送按余额入账）。
- **数据**：今日销售/单量/客单价/连带率、昨日对比、会员与在库件数、近 7/30 天营业额柱状趋势、畅销 Top 5；只做事实展示，无 AI 分析与导购业绩。
- 金额统一以「分」计算，提交前转元；`pricing` 与桌面端同规则（商品折扣 → 会员券 → 店铺券 → 积分 → 余额）。

### 20.3 验证

| 项目 | 结果 |
|---|---|
| `nova-mobile: npm run typecheck` | ✅ 0 error |
| `nova-mobile: npm run lint` | ✅ 0 error / 0 warning |
| `nova-mobile: npm run test` | ✅ 1 文件 / 14 用例（金额与收款计算） |
| `nova-mobile: expo export --platform android` | ✅ 4.5MB bundle 产出成功 |
| `nova-pos-server: npm run typecheck` | ✅ 通过 |
| `nova-pos-server: eslint（改动文件）` | ✅ 0 error |

### 20.4 遗留与说明

- 蓝牙小票打印属 P1：手机端「打印小票」当前只回写打印状态并明确提示，不做假打印。
- 手机端不做批量入库/退库、营销与导购成本/毛利展示（按产品方案职责矩阵）。
- 真机联调需把服务地址改为电脑局域网 IP，并确保 `nova-pos-server` 监听可被局域网访问。
- 文档基线为 Expo 57，脚手架创建时为 SDK 58（当前稳定版），API 用法一致；后续跟随即 `expo install --fix` 升级。
