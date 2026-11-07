# 跨设备文件共享方案

> 适用范围：nova-desktop（多台）+ nova-mobile（多部），同一门店内设备间共享文件、单向下载。
> 状态：方案待确认，确认后编码实现。

---

## 1. 需求

1. 每台设备（桌面 / 手机）开放一个本地目录作为共享目录。
2. 设备间可**单向下载**：A 主动从 B 拉取文件，B 不会主动推送。
3. 在 nova-desktop 与 nova-mobile 的「设置」中各有一个页面，用于：
   - 查看同组其他在线设备；
   - 进入某设备，列出其共享目录下的文件并下载；
   - 维护本设备共享目录（上传 / 删除文件）。

---

## 2. 总体架构

采用 **中继服务（nova-relay）+ 群组模型**：

```
                  nova-relay（WebSocket 中继）
                 ┌──────────────────────────┐
                 │  按 groupToken 分组        │
                 │  组内设备互相可见          │
                 │  透传文件分片（不落地）     │
                 └──────────┬───────────────┘
        ┌───────────┬───────┴───────┬───────────┐
        ▼           ▼               ▼           ▼
   桌面 A        桌面 B          手机 1       手机 2
 ~/.nova/      ~/.nova/        App 沙盒     App 沙盒
 sharefiles    sharefiles      sharefiles   sharefiles
```

- **发现**：所有设备连接 nova-relay，携带由 POS 签发的 `groupToken`。relay 按 token 分组，向组内设备下发在线列表与上下线通知。
- **传输**：文件通过 relay **分片转发**（每片 ≤ 256KB），relay 只在内存中转、不写盘。请求方收齐分片后落盘。
- **存储**：文件始终只存在于各设备自己的共享目录，relay / POS 不持久化业务文件。

### 2.1 为什么用中继而不是直连

- 门店内设备通常同一 WiFi，但手机可能切流量；直连（HTTP / WebRTC）需处理 NAT 与端口，首版复杂度高。
- 中继只需各设备能访问 relay 地址即可，跨网络一定通。
- 文件分片转发，relay 无磁盘压力，内存峰值 = 并发传输数 × 分片大小。

---

## 3. 中继服务 nova-relay

在 `nova-work/` 下新建 `nova-relay/`，复用 nexa-relay 的代码骨架（Express + ws + 心跳 + 重连），改造成**群组路由**。

### 3.1 连接

```
WS /ws?role=desktop|phone&deviceId=&name=&groupToken=
```

- `groupToken` 由 POS 签发（见 §4），relay 校验签名后将设备加入对应群组。
- 握手成功后下发 `relay:hello`：同组在线设备列表。
- 上下线通过 `relay:peer-online` / `relay:peer-offline` 实时广播给组内。

### 3.2 消息路由

- 任意设备可向组内任意设备发消息（`to` 指定目标 deviceId），不传 `to` 则广播组内。
- 带 `id` 的 RPC 若目标离线，回 `relay:error`。
- `maxPayload` 保持 4MB，业务层自行分片。

### 3.3 不存业务内容

与 nexa-relay 一致，只持久化群组关系（`groupToken → 设备列表`），不存文件、不存消息。

---

## 4. 群组令牌 groupToken

由 **nova-pos-server** 签发，确保同门店设备自动同组，无需手动配对。

### 4.1 POS 新增接口

`POST /auth/share-token`

- 桌面端调用：请求头 `x-internal-token` 鉴权 → 返回 `{ groupToken, relayUrl }`。
- 手机端调用：JWT 鉴权 → 返回 `{ groupToken, relayUrl }`。
- `groupToken = HMAC-SHA256(GROUP_SECRET, storeKey)`，`storeKey` 取 POS 的 baseUrl（同门店所有设备连同一个 POS，自然同组）。
- `relayUrl` 从 POS 配置 `~/.nova/server-config.json` 新增字段 `relay.url` 读取。

### 4.2 POS 配置

`~/.nova/server-config.json` 新增：
```json
"relay": { "url": "http://192.168.1.10:8722", "groupSecret": "..." }
```
桌面端不直接读该文件，relay 地址通过 `/auth/share-token` 从 POS 获取。

---

## 5. 文件传输协议

relay 业务消息（JSON 信封，带 `id` 做 RPC 匹配）：

| 方向 | type | payload | 说明 |
|---|---|---|---|
| 请求方 → 持有方 | `share:list` | `{}` | 列出共享目录文件 |
| 持有方 → 请求方 | （回复） | `[{name,size,mtime}]` | 文件列表 |
| 请求方 → 持有方 | `share:download-start` | `{ name }` | 请求下载某文件 |
| 持有方 → 请求方 | `share:chunk` | `{ name, index, total, data:base64 }` | 文件分片 |
| 持有方 → 请求方 | `share:download-end` | `{ name, size }` | 传输完成 |
| 持有方 → 请求方 | `share:error` | `{ name, message }` | 文件不存在 / 读取失败 |

- 分片大小 256KB，`data` 用 base64 编码（简单、跨语言一致）。
- 请求方按 `index` 顺序拼接，收到 `download-end` 后校验总大小，落盘。
- RPC 超时 30s；分片传输无逐片 ack，靠最终 `download-end` 确认。

---

## 6. 桌面端实现

### 6.1 共享目录

`~/.nova/sharefiles/`（与现有 `~/.nova/` 配置同目录）。

### 6.2 主进程新增模块

```
nova-desktop/src/main/
├── share-files/
│   ├── service.ts        # 共享目录 list / copy / delete / stat
│   └── relay-client.ts   # 群组版 WS 客户端（重连 + 心跳 + RPC）
└── ipc/
    └── share.ts          # 渲染层 IPC
```

**share-files/service.ts**：
- `listFiles()` → 读 `~/.nova/sharefiles`，返回 `[{name, size, mtime}]`。
- `uploadFile()` → `dialog.showOpenDialog` 选文件，`fs.copyFile` 到共享目录（复制，不移动原文件）。
- `deleteFile(name)` → 仅删共享目录内文件，`path.basename` 过滤防穿越。
- `saveDownloaded(name, buffer)` → `dialog.showSaveDialog`（默认文件名 = 原文件名），落盘。

**relay-client.ts**：
- 启动时调 POS `/auth/share-token` 换取 `groupToken` + `relayUrl`，连 relay。
- 收到 RPC：
  - `share:list` → `listFiles()` 回包；
  - `share:download-start` → 读文件，分片循环发 `share:chunk`，最后 `share:download-end`。
- 主动发起：
  - `listRemote(deviceId)` → 发 `share:list` 等回包；
  - `downloadRemote(deviceId, name)` → 发 `share:download-start`，收齐分片拼 buffer → `saveDownloaded()`。

### 6.3 IPC 暴露

在 [ipc-channels.ts](file:///c:/my-code/nova-work/nova-desktop/src/shared/ipc-channels.ts) 新增通道，preload 暴露 `window.nova.share.*`：

| 通道 | 用途 |
|---|---|
| `share:local-list` | 列本机共享文件 |
| `share:local-upload` | 选文件复制到共享目录 |
| `share:local-delete` | 删除本机共享文件 |
| `share:devices` | 同组在线设备列表 |
| `share:remote-list` | 列某设备共享文件 |
| `share:remote-download` | 下载某设备的某文件 |
| `share:status` | 中继连接状态 |

### 6.4 渲染层 UI

设置弹窗左侧导航加「文件共享」tab（第 5 个），内容区两个子 tab：

**设备列表**：
- 顶部中继连接状态（已连接 / 重连中 / 断开）。
- 设备卡片：桌面（电脑图标）/ 手机（手机图标），在线绿点、离线灰。
- 点设备 → 面包屑进入其文件列表（名称 / 大小 / 修改时间，每行「下载」按钮，下载中显示进度条）。

**本机共享**：
- 右上「上传文件」→ 选文件 → copy 到 `~/.nova/sharefiles`。
- 文件列表（名称 / 大小 / 修改时间，每行「删除」）。
- 底部显示共享目录路径。

---

## 7. 手机端实现

### 7.1 新增依赖

```bash
npx expo install expo-file-system expo-document-picker expo-sharing
```

- `expo-file-system`：读写 App 沙盒，共享目录 = `FileSystem.documentDirectory + 'sharefiles/'`。
- `expo-document-picker`：上传时从手机选文件。
- `expo-sharing`：下载完成后调起系统「分享 / 另存为」。

### 7.2 共享目录

手机无 `~/.nova`，用 Expo 文档目录：
- Android：`/data/data/<pkg>/files/sharefiles/`（App 私有）
- iOS：App 沙盒 `Documents/sharefiles/`

下载文件默认存此，用户点「保存 / 分享」时用 `expo-sharing` 导出到系统。

### 7.3 中继客户端

`nova-mobile/src/lib/share-relay/`（搬 nexa 手机端 relay-client 结构，改群组路由）：
- `client.ts`：WS 连接、重连、心跳、RPC call。
- `service.ts`：Zustand store，管理设备列表、文件列表、下载状态。

### 7.4 UI

设置页新增「文件共享」入口，进入后：
- **设备列表**：同桌面端，点设备看文件，点文件下载。
- **本机共享**：列 `sharefiles/`，右上「+ 上传」调 `DocumentPicker.getDocumentAsync` → 复制到 sharefiles。
- 下载完成：写入沙盒后弹「已保存，是否打开 / 分享」。

---

## 8. 安全边界

| 风险 | 对策 |
|---|---|
| 外部设备接入 | groupToken 由 POS 签发、relay 校验 HMAC，无 token 拒绝连接 |
| 跨门店串数据 | groupToken 绑定 storeKey（POS baseUrl），不同门店 token 不同 |
| 路径穿越 | 文件名统一 `path.basename`，拒绝含 `..` / 绝对路径的输入，只在共享目录内操作 |
| 大文件拖垮 relay | 分片 256KB，relay 仅内存转发不落地；首版建议单文件 ≤ 200MB |
| 手机写入敏感目录 | 仅写 App 沙盒，导出靠系统分享 Intent |

---

## 9. 实施步骤

1. **nova-relay**：新建 `nova-relay/`，搬 nexa-relay 骨架，改群组路由 + groupToken 鉴权。
2. **POS**：新增 `/auth/share-token` 接口 + `relay.url` 配置。
3. **桌面端**：`share-files` 服务 + relay 客户端 + IPC + 设置页 UI。
4. **手机端**：装依赖 + relay 客户端 + 文件 UI。

---

## 10. 已确认决策

1. **relay 部署**：在 nova-work 新建 `nova-relay/`（自包含，不改动 nexa-relay）。
2. **群组发现**：POS 签发 groupToken 自动同组，零手动配对。
3. **单文件上限**：首版限制 300MB。
4. **手机端入口**：设置页内入口——点击个人头像，底部弹出浮层，在「退出登录」上方新增「共享文件」。
5. **relay 地址**：本次本地起 nova-relay，POS 配置 `relay.url` 指向本地地址。
6. **配置文件**：POS 服务端配置为 `~/.nova/server-config.json`（新增 `relay.url` / `relay.groupSecret` 字段）；桌面端配置为独立的 `~/.nova/api-config.json`，不单独存 relay 地址，通过 `/auth/share-token` 从 POS 获取。
