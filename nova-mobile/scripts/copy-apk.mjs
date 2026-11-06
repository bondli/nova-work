// 将 gradle assembleRelease 产出的 APK 复制到 dist/ 并重命名为 DaveBella-{version}.{yyyyMMdd}.apk
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

// 读取版本号
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version

// 生成日期 YYYYMMDD（本地时区）
const now = new Date()
const pad = (n) => String(n).padStart(2, '0')
const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`

// 查找 release APK
const apkDir = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release')
if (!existsSync(apkDir)) {
  console.error(`[copy-apk] 未找到 APK 输出目录: ${apkDir}`)
  process.exit(1)
}

const apks = readdirSync(apkDir).filter((f) => f.endsWith('.apk'))
if (apks.length === 0) {
  console.error(`[copy-apk] 在 ${apkDir} 未找到任何 .apk 文件`)
  process.exit(1)
}

// 优先取 app-release.apk（默认产物），否则取第一个
const apkName = apks.includes('app-release.apk') ? 'app-release.apk' : apks[0]
const src = join(apkDir, apkName)

// 复制到 dist/
const distDir = join(root, 'dist')
mkdirSync(distDir, { recursive: true })
const destName = `DaveBella-${version}.${date}.apk`
const dest = join(distDir, destName)

copyFileSync(src, dest)
console.log(`[copy-apk] 已复制: ${apkName} -> dist/${destName}`)
