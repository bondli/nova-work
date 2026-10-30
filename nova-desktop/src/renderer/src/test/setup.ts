import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

const hasDom = typeof document !== 'undefined'

/** 每个用例结束后卸载组件，避免弹层与 DOM 残留影响后续查询 */
afterEach(() => {
  if (hasDom) cleanup()
})

/**
 * jsdom 缺失的浏览器 API 兜底。
 * Radix 弹层、ScrollArea 与日历在测试环境会读取这些能力。
 */
if (hasDom) {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  })

  Object.defineProperty(globalThis, 'matchMedia', {
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    })
  })

  Element.prototype.scrollIntoView = () => undefined
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => undefined
  Element.prototype.releasePointerCapture = () => undefined
}
