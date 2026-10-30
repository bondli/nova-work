/** 内容脚本：右键菜单接管与页内采集浮层 */
import { openPanel } from "../panel/mount"

import { findImageUnderPoint, showImageMenu } from "./context-menu"

interface Message {
  type?: string
  imageUrl?: string
}

declare global {
  interface Window {
    /** 防止重复注入时重复绑定监听 */
    __novaContentReady?: boolean
  }
}

/**
 * 淘宝/天猫主图上盖有半透明浮层，右键上下文不是 image，
 * Chrome 原生采集菜单不会出现；这种情况下改用页内菜单。
 */
function bindCoveredImageMenu(): void {
  document.addEventListener(
    "contextmenu",
    (event) => {
      const hit = findImageUnderPoint(event.clientX, event.clientY, event.composedPath())
      if (!hit || hit.direct) return
      event.preventDefault()
      event.stopPropagation()
      showImageMenu({ url: hit.url, x: event.clientX, y: event.clientY })
    },
    true,
  )
}

if (!window.__novaContentReady) {
  window.__novaContentReady = true

  bindCoveredImageMenu()

  chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
    if (message?.type === "NOVA_OPEN_PANEL") {
      openPanel({ initialImageUrl: message.imageUrl })
      sendResponse({ ok: true })
    }
    return false
  })
}
