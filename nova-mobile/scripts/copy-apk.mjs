// 将 gradle assembleRelease 产出的 APK 重新签名后输出到 dist/，命名为 DaveBella-{version}.{yyyyMMdd}.apk
// 注意：AGP 在 minSdk >= 24 时默认只做 v2 签名，华为 P40 等旧安装器会报「未包含任何证书」，
// 因此这里用 apksigner 重新签出 v1(JAR)+v2+v3 三套签名。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
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

// 定位 Android SDK：环境变量 → android/local.properties → 平台默认路径
function resolveSdkDir() {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT
  const localProps = join(root, 'android', 'local.properties')
  if (existsSync(localProps)) {
    const line = readFileSync(localProps, 'utf-8')
      .split('\n')
      .find((l) => l.startsWith('sdk.dir='))
    if (line) return line.slice('sdk.dir='.length).trim()
  }
  const macDefault = join(homedir(), 'Library', 'Android', 'sdk')
  if (existsSync(macDefault)) return macDefault
  return join(homedir(), 'Android', 'Sdk')
}

// 取 build-tools 下版本号最大的一版里的 apksigner
function findApksigner() {
  const buildTools = join(resolveSdkDir(), 'build-tools')
  if (!existsSync(buildTools)) return null
  const versions = readdirSync(buildTools)
    .filter((v) => /^\d+(\.\d+)*$/.test(v))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pb[i] ?? 0) - (pa[i] ?? 0)
        if (diff !== 0) return diff
      }
      return 0
    })
  const exe = process.platform === 'win32' ? 'apksigner.bat' : 'apksigner'
  for (const v of versions) {
    const candidate = join(buildTools, v, exe)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const distDir = join(root, 'dist')
mkdirSync(distDir, { recursive: true })
const destName = `DaveBella-${version}.${date}.apk`
const dest = join(distDir, destName)

const apksigner = findApksigner()
const keystore = join(root, 'android', 'app', 'debug.keystore')

if (apksigner && existsSync(keystore)) {
  // --min-sdk-version 21 用于强制生成 v1 签名（apksigner 在 minSdk>=24 时会跳过 v1）
  execFileSync(
    apksigner,
    [
      'sign',
      '--ks', keystore,
      '--ks-pass', 'pass:android',
      '--key-pass', 'pass:android',
      '--ks-key-alias', 'androiddebugkey',
      '--min-sdk-version', '21',
      '--v1-signing-enabled', 'true',
      '--v2-signing-enabled', 'true',
      '--v3-signing-enabled', 'true',
      '--in', src,
      '--out', dest
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  )
  console.log(`[copy-apk] 已重新签名(v1+v2+v3)并输出: dist/${destName}`)
} else {
  // 找不到 apksigner 时退化为直接复制，仅 v2 签名（旧华为机型可能装不上）
  copyFileSync(src, dest)
  console.warn('[copy-apk] 未找到 apksigner，已直接复制（仅 v2 签名）')
}
