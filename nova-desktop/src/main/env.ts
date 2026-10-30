/**
 * 主进程环境判定。
 * electron-vite 在开发模式下会注入渲染层地址，打包后该变量不存在；
 * 因此用它判断开发 / 生产比 app.isPackaged 更可靠。
 */
export const isDevelopment = Boolean(process.env['ELECTRON_RENDERER_URL'])
