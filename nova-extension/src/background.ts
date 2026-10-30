/** 后台 Service Worker：右键菜单、页面识别中转、图片压缩与上传 */
import { uploadProductImage } from "./shared/api"
import { upgradeImageUrl } from "./shared/image-url"
import type { CollectPayload, UploadResult } from "./shared/types"

const MENU_ID = "nova-collect-image"

function createMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: "采集图片到 DaveBella",
      contexts: ["image"],
    })
  })
}

chrome.runtime.onInstalled.addListener(createMenus)
chrome.runtime.onStartup.addListener(createMenus)

/** 向页面发送消息；内容脚本缺失时（插件安装前已打开的页面）重新注入后重试 */
async function sendToTab<T>(tabId: number, message: unknown, retry = true): Promise<T> {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T
  } catch (error) {
    if (!retry) throw error
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] })
    return (await chrome.tabs.sendMessage(tabId, message)) as T
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) return
  // 商城右键常落在 60x60 / 430x430 缩略图上，还原为原图再交给浮层
  const imageUrl = info.srcUrl ? upgradeImageUrl(info.srcUrl) : ""
  void sendToTab(tab.id, { type: "NOVA_OPEN_PANEL", imageUrl }).catch(() => {
    // 受限页面（chrome://、应用商店页等）无法注入，静默忽略
  })
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = (message as { type?: string })?.type

  if (type === "NOVA_UPLOAD") {
    const payload = (message as { payload?: CollectPayload }).payload
    if (!payload) {
      sendResponse({ ok: false, error: "缺少上传参数" } satisfies UploadResult)
      return false
    }
    void uploadProductImage(payload)
      .then((result) => sendResponse(result))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies UploadResult),
      )
    return true
  }

  return false
})
