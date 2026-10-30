# Nova Mobile 手机端

DaveBella（内部代号 Nova）门店端 Android App：订单、库存、买单、会员、数据五个主 Tab，另有订单编辑 / 退货 / 换货、库存详情、操作日志与设置页。数据全部来自 nova-pos-server，账号登录后使用。

## 技术栈

- Expo 58、React Native 0.88、React 19.3、TypeScript 6.0
- expo-router 58（文件式路由 + typed routes）
- zustand 5、TanStack Query 5、expo-sqlite / expo-camera / expo-secure-store
- lucide-react-native 图标

## 目录结构

```
nova-mobile/
├── app/                       # expo-router 文件式路由
│   ├── _layout.tsx
│   ├── index.tsx              # 启动页（登录态判断）
│   ├── login.tsx
│   ├── settings.tsx           # 主题设置 + POS 服务地址
│   ├── logs.tsx               # 操作日志
│   ├── (tabs)/                # orders / inventory / buy / members / data
│   ├── order/edit.tsx · order/refund.tsx · order/exchange.tsx
│   └── inventory/[sku].tsx
├── src/
│   ├── lib/
│   │   ├── api.ts             # HTTP 封装（baseUrl + JWT，401 触发登出）
│   │   ├── pos.ts             # 业务数据层（与桌面端 features/*/api.ts 对应）
│   │   ├── storage.ts         # 服务地址、令牌持久化（SecureStore/AsyncStorage）
│   │   ├── pricing.ts / money.ts / format.ts / number.ts / types.ts
│   ├── components/            # brand / ui / overlays / toast
│   ├── stores/                # auth / cart / ui（zustand）
│   └── theme/
├── plugins/                   # withCleartextTraffic（允许局域网 HTTP）、导航栏对比度等
├── app.json / AGENTS.md       # Expo 专项规则
```

## 本地开发

```bash
npm install
npm run dev        # expo start，按提示选择模拟器 / 真机 / Expo Go
```

- **服务端地址**：默认 `http://127.0.0.1:9577`。真机或模拟器访问电脑上的 POS 服务时，需要在 App 设置页改成电脑的局域网 IP（如 `http://192.168.1.10:9577`），`127.0.0.1` 在手机上指向手机自己。
- 登录使用 POS 服务的账号体系（`/auth/mobile-login` 一次请求签发 JWT），令牌存 SecureStore。
- Android 默认禁止明文 HTTP，项目已通过 `plugins/withCleartextTraffic.js` 放开，打包时仍会生效。

## 常用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` / `npm start` | `expo start` |
| `npm run android` / `npm run ios` | `expo run:android` / `expo run:ios` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint（eslint-config-expo） |
| `npm run test` | Vitest |
| `npm run build` | typecheck + `expo export --platform android` |
| `npm run pack` | `expo prebuild` 后执行 `./gradlew assembleRelease` |

## 打包（Android）

```bash
npm run pack
# 产物：android/app/build/outputs/apk/release/app-release.apk
```

- 需要 JDK 17 + Android SDK；首次 `prebuild` 会生成 `android/`（已 gitignore，属于按需生成目录）。
- 新增原生依赖必须用 `npx expo install <pkg>`，直接 `npm install` 可能装出不匹配的版本。

## 关键约束

- 业务数据层只在 `src/lib/pos.ts`，页面组件不要直接 `fetch`；金额计算走 `pricing.ts` / `money.ts`，不要各自 `toFixed`。
- 买单提交保留 `submitLockRef` 同步锁与 loading 双保险，避免快速连点重复下单。
- 买单允许议价 / 抹零（实收可低于应收）；库存不足只提示警告，仍可超库存销售。
- 列表分页 20 条，与服务端默认值一致。
- 改动前先读 [AGENTS.md](AGENTS.md)（Expo 专项规则：不要凭记忆写 Expo API、路由约定、CNG 生成目录等）。

## 排查

- 首页一直转圈 / 请求失败：先确认服务地址是否正确、POS 服务是否在监听、手机与电脑是否同一网段。
- 401：令牌过期或 `~/.nova/server-config.json` 的 `auth.jwtSecret` 变了，重新登录。
- 真机装完闪退：确认 `app.json` 的 `android.package`（`com.davebella.nova`）与签名配置。
