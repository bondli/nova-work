/**
 * 页内右键采集菜单
 *
 * 淘宝/天猫的主图上有一层半透明浮层（放大镜），右键落点不是 <img>，
 * Chrome 原生「采集图片」菜单（contexts: ["image"]）不会出现。
 * 这里在浮层上接管 contextmenu，补一个与原生菜单一致的采集入口。
 */
import { openPanel } from "../panel/mount"

const HOST_ID = "nova-collect-menu-host"

const MENU_STYLE = `
:host { all: initial; }
.menu {
  position: fixed;
  min-width: 200px;
  padding: 6px;
  border: 1px solid rgba(31, 34, 51, .12);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 10px 30px rgba(31, 34, 51, .22);
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: #1f2233;
}
.caption {
  padding: 4px 8px 6px;
  font-size: 11px;
  color: #8b8f9e;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.item:hover,
.item:focus-visible {
  background: #eef1ff;
  outline: none;
}
.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #4b5cff;
}
`

interface HitImage {
  url: string
  /** 右键落点是否直接命中图片本身（直接命中交给 Chrome 原生菜单） */
  direct: boolean
}

function imageSource(img: HTMLImageElement): string {
  return (
    img.currentSrc ||
    img.src ||
    img.getAttribute("data-src") ||
    img.getAttribute("data-original") ||
    ""
  )
}

function backgroundImage(el: Element): string {
  if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement) {
    return ""
  }
  const value = getComputedStyle(el).backgroundImage
  const match = /url\(["']?(.+?)["']?\)/.exec(value)
  return match?.[1] ?? ""
}

/**
 * 找右键落点下的图片：
 * 1) 事件路径里直接有 <img>（浮层不存在时）
 * 2) 用 elementsFromPoint 穿透浮层找底层 <img>
 * 3) CSS 背景图兜底（部分商城主图用 background-image 渲染）
 */
export function findImageUnderPoint(
  x: number,
  y: number,
  path: EventTarget[],
): HitImage | null {
  for (const node of path) {
    if (node instanceof HTMLImageElement) {
      const url = imageSource(node)
      if (url) return { url, direct: true }
    }
  }

  const stack = document.elementsFromPoint(x, y)
  for (const el of stack) {
    if (el instanceof HTMLImageElement) {
      const url = imageSource(el)
      if (url && !url.startsWith("data:")) return { url, direct: false }
    }
  }

  for (const el of stack.slice(0, 6)) {
    const url = backgroundImage(el)
    if (/^https?:/i.test(url)) return { url, direct: false }
  }

  return null
}

let activeClose: (() => void) | null = null

export function closeImageMenu(): void {
  activeClose?.()
  activeClose = null
}

export function showImageMenu(options: { url: string; x: number; y: number }): void {
  closeImageMenu()

  const { url, x, y } = options
  const host = document.createElement("div")
  host.id = HOST_ID
  host.style.cssText = "position: fixed; inset: 0; z-index: 2147483647;"

  const shadow = host.attachShadow({ mode: "open" })
  const style = document.createElement("style")
  style.textContent = MENU_STYLE

  const menu = document.createElement("div")
  menu.className = "menu"
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  const caption = document.createElement("div")
  caption.className = "caption"
  caption.textContent = "DaveBella 商品采集"

  const item = document.createElement("button")
  item.type = "button"
  item.className = "item"

  const dot = document.createElement("span")
  dot.className = "dot"
  const label = document.createElement("span")
  label.textContent = "采集图片到 DaveBella"
  item.append(dot, label)

  menu.append(caption, item)
  shadow.append(style, menu)
  document.documentElement.appendChild(host)

  const rect = menu.getBoundingClientRect()
  if (rect.right > window.innerWidth - 8) {
    menu.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`
  }
  if (rect.bottom > window.innerHeight - 8) {
    menu.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`
  }

  let closed = false
  function close(): void {
    if (closed) return
    closed = true
    host.remove()
    document.removeEventListener("keydown", onKeyDown, true)
    document.removeEventListener("scroll", onDismiss, true)
    document.removeEventListener("contextmenu", onDismiss, true)
    if (activeClose === close) activeClose = null
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") close()
  }
  const onDismiss = (event: Event): void => {
    if (!event.composedPath().includes(menu)) close()
  }

  item.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    close()
    openPanel({ initialImageUrl: url })
  })

  host.addEventListener("mousedown", onDismiss, true)
  document.addEventListener("keydown", onKeyDown, true)
  document.addEventListener("scroll", onDismiss, true)
  document.addEventListener("contextmenu", onDismiss, true)

  activeClose = close
}
