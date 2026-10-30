# Nova Extension 商品图片采集插件

DaveBella（内部代号 Nova）的 Chrome 浏览器扩展（Manifest V3）：在商品详情页右键采集款号、品名与主图，浮层核对后一键上传到 nova-pos-server，供收银台扫码开单时展示商品图。

## 技术栈

- Chrome Manifest V3（`minimum_chrome_version: 110`），service worker 以 ESM 运行
- React 18 + TypeScript 5.6
- esbuild 0.24（background / content / popup 打包）+ Tailwind CLI 3.4（构建脚本 `scripts/build.mjs`）

## 目录结构

```
nova-extension/
├── manifest.json              # MV3 清单：contextMenus / storage / scripting，content script 注入所有页面
├── scripts/build.mjs          # esbuild 多入口打包 + Tailwind + 静态资源拷贝到 dist/
├── icons/                     # 16 / 48 / 128 图标
└── src/
    ├── background.ts          # 右键菜单注册、采集触发、图片抓取与上传
    ├── content/               # 页面内采集逻辑（款号、品名、主图）
    ├── panel/                 # 页面浮层：预览、核对款号、提交
    ├── popup/                 # 工具栏弹窗：配置 POS 地址与上传令牌
    ├── options/               # 设置页组件
    ├── lib/                   # 采集解析、上传
    ├── shared/                # storage.ts（配置读写）、types.ts
    ├── components/ / styles/  # UI 与样式
    └── types/
```

## 构建

```bash
npm install
npm run build      # 产物输出 dist/
npm run dev        # --watch 增量构建，改代码后到扩展页点「重新加载」
npm run typecheck
```

> 本项目没有配置 lint / test 脚本，以 `typecheck` 为门禁。

## 安装到 Chrome

1. 打开 `chrome://extensions`
2. 右上角开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择 **`nova-extension/dist/`**（不是项目根目录）
4. 修改代码后，回到扩展卡片点「重新加载」；页面需刷新以重新注入 content script

## 首次配置

点击工具栏图标打开弹窗，填写：

| 配置项 | 说明 |
|---|---|
| POS 服务地址 | 可填完整地址（`http://192.168.1.10:9577`）或直接填 `/inventory/uploadImage` 完整地址，插件会自动补全路径 |
| 上传令牌 | 必须与 `~/.nova/server-config.json` 中 `storage.uploadToken` 一致，否则服务端返回 403 |

配置保存在 `chrome.storage.local`，换设备 / 换服务端时重新填写。

## 使用流程

1. 在商品详情页选中图片或空白处 → 右键「采集到 DaveBella」；
2. 页面浮层展示解析到的款号、品名与主图，可修改款号；
3. 点击上传 → 插件 `POST /inventory/uploadImage`（multipart：`sn` + `file`，令牌以 `?token=` 查询参数带上；服务端同时兼容 `x-upload-token` 请求头），服务端按款号落到 `storage.uploadDir`；
4. 桌面端 / 手机端扫码开单时，商品图通过 `/inventory-image/<文件名>` 直接展示。

## 权限说明

| 权限 | 用途 |
|---|---|
| `contextMenus` | 右键菜单入口 |
| `storage` | 保存 POS 地址与上传令牌 |
| `scripting` | 注入采集脚本、抓取页面图片 |
| `host_permissions: <all_urls>` | 商品站点不固定，需要在任意商品页采集 |

## 分发

- 内部使用：把 `dist/` 压缩后发给门店，按上面的「加载已解压」方式安装（企业策略可自行做 crx 打包）。
- 上架 Chrome Web Store：以 `dist/` 打包 zip 上传，注意权限说明与隐私政策（`scripting` + `<all_urls>` 审核较严格）。

## 排查

- 右键没有菜单：扩展未加载成功或 service worker 报错，到 `chrome://extensions` 查看「服务工作进程」日志。
- 上传 403：上传令牌与服务端 `storage.uploadToken` 不一致，或服务地址指向了错误端口。
- 上传失败但无提示：确认 POS 服务可达（同一局域网、端口 9577 未被防火墙拦截）、`storage.uploadDir` 可写。
- 采集不到款号：目标页面结构与解析规则不匹配，检查 `src/lib` 中的解析逻辑与 `content/` 选择器。
