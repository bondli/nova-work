import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Copy } from 'lucide-react'
import { cn } from '@renderer/lib/utils'

/** 项目中 Radix 弹层的内容节点选择器，按 DOM 顺序取最后一个即最上层 */
const LAYER_SELECTOR =
  '[data-slot="sheet-content"], [data-slot="dialog-content"], [data-slot="alert-dialog-content"]'

/**
 * 全局文字选中复制：用户用鼠标拖选或双击选中文字后，
 * 在选区附近浮出复制按钮，点击即可复制选中内容。
 * 挂载在应用根部即可全局生效。
 *
 * 注意：Radix 抽屉/弹窗打开时会给 body 加 pointer-events: none，
 * 若按钮挂在 body 下会继承该样式导致 hover / 点击全部失效；
 * 且点击按钮会被 Radix 判定为「外部点击」而直接关闭弹层。
 * 因此按钮需要通过 Portal 渲染进最上层弹层内容里。
 */
export function SelectionCopy() {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [copied, setCopied] = useState(false)
  const [layer, setLayer] = useState<HTMLElement | null>(null)
  const textRef = useRef('')
  // 标记当前鼠标按下的是否是复制按钮本身，用于在 mouseup 时跳过选区重算
  const pressingButtonRef = useRef(false)

  const hide = useCallback(() => {
    setVisible(false)
    textRef.current = ''
  }, [])

  const updateFromSelection = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      hide()
      return
    }
    const text = sel.toString().trim()
    if (!text) {
      hide()
      return
    }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    // 选区为空（如只选了换行）时 rect 宽高为 0，不展示
    if (rect.width === 0 && rect.height === 0) {
      hide()
      return
    }

    // 找到最上层的弹层内容节点；没有弹层时退回 document.body
    const layers = document.querySelectorAll<HTMLElement>(LAYER_SELECTOR)
    const currentLayer = layers.length > 0 ? layers[layers.length - 1]! : null

    // 视口坐标 → 弹层内绝对坐标；按钮定位在选区上方居中，留出 6px 间距
    let left = rect.left + rect.width / 2
    let top = rect.top - 6
    if (currentLayer) {
      const layerRect = currentLayer.getBoundingClientRect()
      left = left - layerRect.left + currentLayer.scrollLeft
      top = top - layerRect.top + currentLayer.scrollTop
    }

    textRef.current = text
    setLayer(currentLayer)
    setPos({ x: left, y: top })
    setVisible(true)
    setCopied(false)
  }, [hide])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // 记录是否按在复制按钮上，mouseup 时据此决定是否重算选区
      const target = e.target as HTMLElement
      pressingButtonRef.current = Boolean(target.closest('[data-selection-copy]'))
    }

    const handleMouseUp = () => {
      // 点击复制按钮时不重算选区，避免按钮被提前隐藏导致 click 不触发
      if (pressingButtonRef.current) {
        pressingButtonRef.current = false
        return
      }
      // 延迟一帧再读取选区，确保浏览器已完成选中
      requestAnimationFrame(updateFromSelection)
    }
    const handleSelectionChange = () => {
      // selectionchange 触发频繁，只在有可见选区时同步位置
      updateFromSelection()
    }
    const handleScroll = () => {
      if (visible) hide()
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }

    // mousedown 在捕获阶段监听，确保先于其他逻辑记录目标
    document.addEventListener('mousedown', handleMouseDown, true)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('selectionchange', handleSelectionChange)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectionchange', handleSelectionChange)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [updateFromSelection, hide, visible])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(textRef.current)
      setCopied(true)
      setTimeout(() => hide(), 800)
    } catch {
      hide()
    }
  }

  if (!visible) return null

  const button = (
    <button
      type="button"
      data-selection-copy
      onMouseDown={(e) => {
        // 阻止默认行为：避免点击按钮时清空已选中的文字
        e.preventDefault()
      }}
      onClick={() => void handleCopy()}
      aria-label={copied ? '已复制' : '复制选中内容'}
      title={copied ? '已复制' : '复制选中内容'}
      className={cn(
        // pointer-events-auto：弹层打开时 body 为 pointer-events: none，这里显式恢复
        'pointer-events-auto z-10 flex -translate-x-1/2 -translate-y-full items-center gap-1 rounded-md border border-border bg-popover px-2 py-1 text-meta text-popover-foreground shadow-md select-none',
        layer ? 'absolute' : 'fixed z-[9999]',
        'hover:bg-accent'
      )}
      style={{ left: pos.x, top: pos.y }}
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
      {copied ? '已复制' : '复制'}
    </button>
  )

  // 有弹层时渲染进弹层内容内部，否则挂到 body
  return createPortal(button, layer ?? document.body)
}
