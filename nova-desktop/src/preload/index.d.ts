import type { NovaApi } from './index'

/** 全局类型声明：渲染层通过 window.nova 访问主进程能力 */
declare global {
  interface Window {
    nova: NovaApi
  }
}

export {}
