/**
 * electron-builder afterPack 钩子：macOS 打包后对整包做 ad-hoc 签名。
 *
 * 背景：electron-builder.yml 里 mac.identity 为 null（不做正式签名），
 * 产出的 .app 只有残缺的 linker 签名，分发到其他 Mac 后会因 Gatekeeper
 * 校验失败提示「已损坏，无法打开」。
 * 这里用 ad-hoc 签名（codesign -s -）把整包签名补完整，分发后至少可以
 * 通过「隐私与安全性 → 仍要打开」放行，而不会直接判为损坏。
 */
import { execFileSync } from 'node:child_process'

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = `${context.appOutDir}/${context.packager.appInfo.productFilename}.app`
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
