# DaveBella 桌面端 D5 验收报告

> 日期：2026-10-26  
> 范围：联调与收口（D5）—— 服务端联调边界、E2E、性能、打包、双尺寸视觉回归  
> 结论：**质量门禁全绿，可进入视觉验收签字**

---

## 1. 验收结论

| 门禁项 | 结果 | 证据 |
|---|---|---|
| E2E 全绿 | ✅ 7/7 通过（24.1s） | `npx playwright test` |
| 构建产物可安装/可启动 | ✅ dmg 已产出，打包 app 可启动到登录页 | `npm run pack:mac`、Playwright 启动 `release/mac-arm64/DaveBella.app` |
| 视觉验收清单签字 | ⏳ 待评审签字 | 本文件 §5、§6 |

---

## 2. 质量门禁

| 项目 | 命令 | 结果 |
|---|---|---|
| 类型检查 | `npm run typecheck` | ✅ node + web 均通过 |
| Lint | `npm run lint` | ✅ 0 error；5 个既有 `react-refresh` warning（`artifact-utils.tsx`） |
| 单元测试 | `npm run test` | ✅ 7 个文件 / 42 个用例通过 |
| 构建 | `npm run build` | ✅ main / preload / renderer 三段产物生成 |
| E2E | `npm run test:e2e` | ✅ 7/7 通过 |
| 打包 | `npm run pack:mac` | ✅ arm64 与 x64 dmg 均生成 |

---

## 3. E2E 用例

运行方式：`npm run test:e2e`（先构建生产产物，再由 Playwright 启动 Electron；每个用例使用独立的 `NOVA_HOME` 临时目录）。

| # | 用例 | 覆盖点 | 结果 |
|---|---|---|---|
| 1 | 未登录调用业务 IPC 被拒绝 | 渲染进程未登录时 `agent.list` 返回 `UNAUTHENTICATED` | ✅ |
| 2 | 错误密码与登录成功 | 错误提示「用户名或密码不正确」；管理员 `linxiao` 登录进入经营分析 | ✅ |
| 3 | 注册默认导购员 | 新账号默认 clerk，任务时间输入只读 | ✅ |
| 4 | 导航冒烟、性能与双尺寸截图 | 7 个页面切换、性能计时、1440×900 与 1280×800 截图 | ✅ |
| 5 | 业务页关键交互 | 订单明细抽屉、会员详情、营销上下线提示、数据中心近 7 天切换 | ✅ |
| 6 | 通知闭环与设置自动保存 | 未读红点 → 通知列表 → 跳转经营分析并已读；任务时间改 08:30 写入 `settings.json` | ✅ |
| 7 | 经营分析流式与产物 | 本地假 SSE：流式文本 → `write` → `publish_artifact` → 产物抽屉 Markdown 预览 | ✅ |

E2E 隔离手段：

- `NOVA_HOME` 指向 `os.tmpdir()` 下的独立目录（设置、账号、通知、工作区互不污染）；
- `NOVA_E2E=1` 时 `userData` 落在临时目录并关闭调度器，避免单实例锁冲突与真实模型请求；
- 经营分析用例使用本地假 SSE 服务，不依赖真实 DeepSeek 与 MySQL。

---

## 4. 性能数据

采集于 1440×900、macOS arm64、生产构建。

| 指标 | 数值 |
|---|---|
| 启动到登录页可见 | 696 ms |
| 登录提交到经营分析可见 | 161 ms |
| 页面切换（含 500ms 数据稳定等待） | 544–563 ms（7 页均值约 558 ms） |
| 页面切换实际渲染（扣除稳定等待） | < 64 ms |

> 切页计时包含统一的 500ms 数据稳定等待，用于截图前让查询完成；实际标题渲染在 100ms 内。

---

## 5. 视觉回归

截图目录：[screenshots/d5](./screenshots/d5/)，共 24 张。

### 5.1 双尺寸全页面

| 页面 | 1440×900 | 1280×800 |
|---|---|---|
| 经营分析 | [d5-analysis-1440.png](./screenshots/d5/d5-analysis-1440.png) | [d5-analysis-1280.png](./screenshots/d5/d5-analysis-1280.png) |
| 买单 | [d5-buy-1440.png](./screenshots/d5/d5-buy-1440.png) | [d5-buy-1280.png](./screenshots/d5/d5-buy-1280.png) |
| 订单中心 | [d5-orders-1440.png](./screenshots/d5/d5-orders-1440.png) | [d5-orders-1280.png](./screenshots/d5/d5-orders-1280.png) |
| 库存中心 | [d5-inventory-1440.png](./screenshots/d5/d5-inventory-1440.png) | [d5-inventory-1280.png](./screenshots/d5/d5-inventory-1280.png) |
| 会员中心 | [d5-members-1440.png](./screenshots/d5/d5-members-1440.png) | [d5-members-1280.png](./screenshots/d5/d5-members-1280.png) |
| 营销中心 | [d5-marketing-1440.png](./screenshots/d5/d5-marketing-1440.png) | [d5-marketing-1280.png](./screenshots/d5/d5-marketing-1280.png) |
| 数据中心 | [d5-data-1440.png](./screenshots/d5/d5-data-1440.png) | [d5-data-1280.png](./screenshots/d5/d5-data-1280.png) |

### 5.2 关键状态

| 场景 | 截图 |
|---|---|
| 登录页 | [d5-login-1440.png](./screenshots/d5/d5-login-1440.png) |
| 订单明细抽屉 | [d5-orders-detail.png](./screenshots/d5/d5-orders-detail.png) |
| 会员详情抽屉 | [d5-members-detail.png](./screenshots/d5/d5-members-detail.png) |
| 营销下线反馈 | [d5-marketing-offline.png](./screenshots/d5/d5-marketing-offline.png) |
| 数据中心近 7 天 | [d5-data-7d.png](./screenshots/d5/d5-data-7d.png) |
| 通知列表（红点） | [d5-notification-menu.png](./screenshots/d5/d5-notification-menu.png) |
| 通知跳转已读 | [d5-notification-jump.png](./screenshots/d5/d5-notification-jump.png) |
| 任务设置（自动保存） | [d5-task-settings.png](./screenshots/d5/d5-task-settings.png) |
| 导购员设置只读 | [d5-settings-clerk.png](./screenshots/d5/d5-settings-clerk.png) |
| 分析产物预览 | [d5-analysis-artifact.png](./screenshots/d5/d5-analysis-artifact.png) |

### 5.3 视觉检查项

- [x] 侧栏 78px、顶部栏 56px、内容区 16px 内边距与 demo 一致；
- [x] 卡片 12px 圆角、白底、1px 边框；指标卡数值 `tabular-nums`；
- [x] 弹窗浅色底 `#fff`、导航底 `#fafafa`、遮罩与阴影一致；
- [x] 表格行高、状态徽标五态、操作列文案与 demo 一致；
- [x] 1440×900 与 1280×800 无横向溢出、无内容截断；
- [x] 1280 宽度下筛选条与表格仍保持单行操作列。

---

## 6. 打包产物

| 产物 | 路径 | 大小 |
|---|---|---|
| macOS arm64 dmg | `nova-desktop/release/DaveBella-1.0.0-arm64.dmg` | 117 MB |
| macOS x64 dmg | `nova-desktop/release/DaveBella-1.0.0.dmg` | 121 MB |
| 未压缩 arm64 app | `nova-desktop/release/mac-arm64/DaveBella.app` | — |

启动验证：以 Playwright 直接启动打包后的 arm64 app，登录页正常渲染，窗口标题 `DaveBella`。

打包脚本：

- `npm run pack` / `npm run pack:mac`：构建并产出 macOS dmg；
- `npm run pack:win`：Windows nsis（需在 Windows 或具备 wine 的环境执行）。

---

## 7. 已知问题与限制

1. **服务端边界**：本仓库只有 `nova-desktop`，六大业务页仍使用本地 mock 数据；本轮联调验收覆盖 IPC、认证、经营分析与打包链路，未接入 `nova-pos-server`。
2. **经营分析真实链路**：自动化用例使用本地假 SSE 验证流式与工具循环；真实 DeepSeek + 远程 MySQL 已在 D3 手工跑通，不纳入 E2E 以避免网络波动导致门禁不稳定。
3. **定时任务**：E2E 关闭调度器，通知闭环通过预置 `notifications.json` 验证；真实 cron 与补跑逻辑在 D4 已手工验收。
4. **Windows 包**：`pack:win` 未在 macOS 上执行（缺少 Wine/Windows 环境），配置与脚本已就绪。
5. **签名与公证**：`identity: null`，安装包未签名、未公证；首次打开需右键「打开」或调整 Gatekeeper。
6. **应用图标**：当前使用 Electron 默认图标，正式发布前需替换品牌图标。
7. **主题矩阵**：本轮截图覆盖浅色主题；深色主题在 D1–D4 手工验收，未纳入自动截图矩阵。

---

## 8. 签字

| 角色 | 结论 | 日期 |
|---|---|---|
| 产品 / 视觉验收 | ⏳ 待签字 | |
| 研发负责人 | ⏳ 待签字 | |
