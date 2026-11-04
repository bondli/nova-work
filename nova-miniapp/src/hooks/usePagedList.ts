import { useCallback, useEffect, useRef, useState } from 'react'

type Fetcher<T> = (
  current: number,
  pageSize: number
) => Promise<{ list: T[]; count: number }>

/**
 * 分页列表通用逻辑：首屏加载 + 触底追加 + 加载/错误/空态。
 * 页面只需把 loadMore 绑到 Taro.useReachBottom。
 */
export function usePagedList<T>(fetcher: Fetcher<T>, deps: unknown[] = [], pageSize = 20) {
  const [list, setList] = useState<T[]>([])
  const [count, setCount] = useState(0)
  const [current, setCurrent] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const loadingRef = useRef(false)

  const load = useCallback(
    async (page: number, replace = false) => {
      if (loadingRef.current) return
      loadingRef.current = true
      setLoading(true)
      setError('')
      try {
        const result = await fetcher(page, pageSize)
        setCount(result.count)
        setCurrent(page)
        setList((prev) => (replace ? result.list : [...prev, ...result.list]))
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败，请稍后重试')
      } finally {
        loadingRef.current = false
        setLoading(false)
      }
    },
    // fetcher 由调用方保证引用稳定（通常是模块级 service 包装）
    [fetcher, pageSize]
  )

  useEffect(() => {
    setList([])
    setCount(0)
    setCurrent(1)
    void load(1, true)
    // 依赖由调用方显式传入，例如筛选 tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const loadMore = useCallback(() => {
    if (loadingRef.current) return
    if (list.length >= count) return
    void load(current + 1)
  }, [count, current, list.length, load])

  const reload = useCallback(() => {
    void load(1, true)
  }, [load])

  return {
    list,
    count,
    loading,
    error,
    current,
    hasMore: list.length < count,
    loadMore,
    reload
  }
}
