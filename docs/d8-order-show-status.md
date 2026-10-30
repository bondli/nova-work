# 隐藏订单（orderShowStatus）实现方案

> 适用范围：桌面端订单、数据页与全局导航。
> 流程图：[diagrams/07-order-show-status.html](./diagrams/07-order-show-status.html)

## 1. 背景

老系统有一个不写在明面上的能力：给商场检查时**少报营业额**，从而避免额外的销售佣金。做法是导购每天在对账抽屉里把部分订单「置为无效」——实际写入的是订单的 `showStatus` 字段（`normal` / `hidden`）。

本方案要在新桌面端复刻的是**观察侧**：一个对商场不可见的开关，决定订单与报表是否把 `hidden` 订单算进去。

## 2. 数据与语义

| 位置 | 内容 |
|---|---|
| 表字段 | `order.showStatus`，默认 `normal`；「置为无效」改为 `hidden` |
| 写入入口 | 对账抽屉操作列「置为无效 / 恢复正常」→ `POST /order/toggleShow { orderSn, showStatus }` |
| 读取入口 | 查询接口可选参数 `showStatus` |

传参语义（服务端实现）：

- **传 `showStatus=hidden`** → 查询条件加 `showStatus = 'normal'`，即**排除**无效订单；不传 → 全量。
- 传其他值等同于不传（服务端只判断 `if (showStatus)`，因此客户端只在 hidden 时传）。
- 例外：`queryOrderList` 在带 `orderSn` 或 `userPhone` 时会 `delete where.showStatus`，保证按单号 / 手机号精确查询一定查得到。

## 3. 开关状态

状态只有两个取值，前端单例保存在 Zustand store 中，并持久化到 `localStorage`：

| 键 | 存储 | 作用 |
|---|---|---|
| `orderShowStatus` | localStorage | 开关值 `all` / `hidden` |
| `orderShowStatusRole` | localStorage | 上次落默认值的角色，角色一致时刷新不再覆盖 |
| `orderShowStatusDeadline` | localStorage | 导购 5 分钟倒计时的截止时间（切换会整页刷新，定时器活不过刷新） |

**角色默认**：`AppShell` 挂载时调用 `initForRole()`——

- 管理员 → `all`，导购员 → `hidden`。
- 若 `orderShowStatusRole` 与当前角色一致，则**保留已切换的值**，避免整页刷新后被默认值打回去；换角色才重新落默认值。

## 4. 切换与刷新

开关是左侧导航栏「数据」项下方的**透明按钮**（56×34，无文字无图标，仅 aria-label）。点击后：

1. 计算目标值（`all ⇄ hidden`）。
2. 写 `localStorage.orderShowStatus`。
3. 导购员切到 `all` 时写 `orderShowStatusDeadline = now + 5 分钟`；切回 `hidden` 时清除该键并清掉倒计时。
4. `window.nova.system.reload()` 整页刷新（主进程 `webContents.reload()`）——让订单列表、总览、数据页图表与顶栏提示一次性对齐。
   > 不能用页面内的 `location.reload()`：主进程对 `will-navigate` 做了 `preventDefault`，会被静默拦截，页面根本不会重载。

> 整页刷新会丢弃收银台未挂单的购物车，属于已知代价；不建议开单中途切换。

## 5. 自动回退（仅导购员）

导购切到 `all` 后 5 分钟内可查看，超时自动回到 `hidden`：

- 因为切换会整页刷新、JS 定时器活不过刷新，只把**截止时间**写进缓存，刷新后由 `initForRole()` 重新挂 `setTimeout`。
- 剩余时间大于 0 → 按剩余时长倒计时；已过期（例如应用被关掉重开）→ 立刻回到 `hidden` 并刷新。
- 回退动作：清 `orderShowStatusDeadline` → 写 `hidden` → 刷新整页，只执行一次。
- 5 分钟内导购自己切回 `hidden`：`toggle()` 清空截止时间，旧倒计时随刷新一起作废。

## 6. 查询口径

只有值为 `hidden` 时才给接口加参数，`all` 时请求与改造前完全一致。

| 域 | 接口 | 参数位置 |
|---|---|---|
| 订单 | `GET /order/queryList`（列表） | query |
| 订单 | `GET /order/queryOrderSummary`（总览 + 环比上一区间） | query |
| 数据 | `POST /data/getCoreData`（指标卡当期 + 上一期） | body |
| 数据 | `GET /data/getOrderCharts`（店铺月视图） | query |
| 数据 | `GET /data/getStoreDailyCharts`（店铺按月下钻） | query |
| 数据 | `GET /data/getSalerCharts`（导购员月视图） | query |
| 数据 | `GET /data/getSalerDailyCharts`（导购员按月下钻） | query |

**不传参数的场景**：

- 对账抽屉（`fetchReconcile`）——导购必须能看到全部订单才能「置为无效」。
- 订单详情、退换货、打印等按单号定位的操作。

React Query 的 key 里加入开关值，切换（刷新后）自然重新取数，不依赖手写失效。

## 7. 顶栏提示

缓存值为 `hidden` 时，右上角用户图标使用主题色 `#4f46e5`；`all` 时为常规灰色。这样导购能一眼确认当前是否处于「对商场隐藏」状态。

## 8. 边界与风险

| 场景 | 行为 |
|---|---|
| 应用重启（同一角色） | 角色标记一致 → 保留缓存值；若导购的 5 分钟倒计时仍在，按剩余时间续挂 |
| 应用重启（倒计时已过期） | 启动即回退 `hidden` 并刷新一次 |
| 换角色登录 | `orderShowStatusRole` 不一致 → 重新落角色默认值（管理员 all，导购 hidden） |
| 手动清缓存 | `orderShowStatusRole` 一并清掉 → 回到角色默认 |
| 多窗口 / 多机 | 各自维护本地值，不同步；服务端不做该状态存储 |
| 切换瞬间 | 整页刷新，列表与图表不会出现新旧口径混排 |

## 9. 代码位置

| 位置 | 职责 |
|---|---|
| `nova-desktop/src/renderer/src/stores/order-show-status-store.ts` | 状态、缓存读写、角色默认、回退时间点与定时器、整页刷新 |
| `nova-desktop/src/renderer/src/components/layout/AppShell.tsx` | 挂载时执行 `initForRole()` |
| `nova-desktop/src/renderer/src/components/layout/AppRail.tsx` | 「数据」下方透明切换按钮 |
| `nova-desktop/src/renderer/src/components/layout/UserMenu.tsx` | hidden 时用户图标 `#4f46e5` |
| `nova-desktop/src/renderer/src/features/orders/api.ts` | `toQuery(includeShowStatus)`，列表 / 总览带参数，对账不带 |
| `nova-desktop/src/renderer/src/features/orders/queries.ts` | 查询 key 携带开关值 |
| `nova-desktop/src/renderer/src/features/data/api.ts` | `showStatusParam()` 供指标与图表接口使用 |
| `nova-pos-server/src/router/order-controller.ts` | `queryOrderList` / `queryOrderSummary` 过滤；`toggleShow` 写值 |
| `nova-pos-server/src/router/data-controller.ts` | 5 个报表接口按 `showStatus=hidden` 过滤 |

## 10. 验证

1. 管理员登录 → 用户图标灰色，订单页条数 = 全量（含无效单）。
2. 点导航「数据」下方空白 → 整页刷新，图标变紫，订单条数 / 总览金额 / 数据页指标同时下降。
3. 再点一次 → 恢复全量、图标回灰。
4. 导购登录 → 默认即为隐藏（紫色）；点一次切到 all，5 分钟后自动刷新回隐藏。
5. 开关为隐藏时按订单号查询一张无效单，仍能查到（服务端清空条件的例外）。
6. 打开对账抽屉，无效单仍在列表中，可正常「置为无效 / 恢复正常」。
