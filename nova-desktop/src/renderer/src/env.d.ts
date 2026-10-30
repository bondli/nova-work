/**
 * 渲染层全局常量声明。
 * __APP_VERSION__ 由 electron.vite.config.ts 在构建时通过 define 注入，
 * 格式为「基础版本.构建日期」，开发环境额外带 .dev 标识。
 */
declare const __APP_VERSION__: string
