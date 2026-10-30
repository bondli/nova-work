import { useEffect, useState } from 'react'
import {
  FileCode2,
  Folder,
  Inbox,
  Loader2,
  Maximize2,
  Minimize2,
  PanelRightClose
} from 'lucide-react'
import type { ArtifactMeta } from '@shared/types/analysis'
import { MarkdownRenderer } from '@renderer/components/markdown-renderer'
import { cn } from '@renderer/lib/utils'
import {
  FileIconFor,
  formatSize,
  isHtmlFile,
  isMarkdownFile
} from '@renderer/features/analysis/artifact-utils'

interface ArtifactDrawerProps {
  open: boolean
  sessionId: string
  artifacts: ArtifactMeta[]
  selectedId: string | null
  /** 是否展示右侧文件树；从消息内的文件卡进入时隐藏 */
  showFileList?: boolean
  onSelect: (artifactId: string) => void
  onClose: () => void
}

/**
 * 产物面板：右侧全高抽屉，结构与 nexa 的 artifacts-panel 对齐。
 * 左侧预览 + 右侧 240px 文件列表；支持铺满任务页，不提供下载按钮。
 */
export function ArtifactDrawer({
  open,
  sessionId,
  artifacts,
  selectedId,
  showFileList = true,
  onSelect,
  onClose
}: ArtifactDrawerProps) {
  const [maximized, setMaximized] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frameLoaded, setFrameLoaded] = useState(false)

  const active =
    artifacts.find((artifact) => artifact.id === selectedId) ?? artifacts[0] ?? null
  const activeId = active?.id ?? null

  useEffect(() => {
    if (!open || !activeId) {
      setContent(null)
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    setContent(null)
    setFrameLoaded(false)

    void window.nova.agent
      .readArtifact({ sessionId, artifactId: activeId })
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setContent(result.data.content)
        } else {
          setError(result.error.message)
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : '读取产物失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, sessionId, activeId])

  /** 预览主体：加载态 / 错误态 / HTML iframe / Markdown / 纯文本 */
  function renderPreview() {
    if (!active) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">点击右侧文件查看内容</p>
        </div>
      )
    }
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="加载中" />
        </div>
      )
    }
    if (error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <FileCode2 className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-xs text-destructive">预览加载失败</p>
          <p className="text-[10px] text-muted-foreground">{error}</p>
        </div>
      )
    }
    if (content === null) return null

    if (isHtmlFile(active.path || active.title)) {
      return (
        <div className="relative h-full w-full bg-white">
          <iframe
            key={active.id}
            title={active.title}
            srcDoc={content}
            sandbox="allow-scripts allow-forms allow-popups"
            className="h-full w-full border-0"
            onLoad={() => setFrameLoaded(true)}
          />
          {!frameLoaded ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : null}
        </div>
      )
    }

    if (isMarkdownFile(active.path || active.title)) {
      return (
        <div className="p-4">
          <MarkdownRenderer content={content} />
        </div>
      )
    }

    return (
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-foreground/80">
        {content}
      </pre>
    )
  }

  return (
    <>
      {/* 遮罩：点关闭；no-drag 防止底层顶栏拖动区穿透 */}
      {open ? (
        <div
          className="app-no-drag fixed inset-0 z-40 animate-in fade-in-0 duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        aria-hidden={!open}
        aria-label="产物面板"
        className={cn(
          'app-no-drag fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-card shadow-2xl transition-all duration-200 ease-out',
          open ? 'translate-x-0' : 'translate-x-full',
          maximized ? 'w-[calc(100vw-78px)]' : 'w-[600px] max-w-[85vw]'
        )}
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex min-w-0 items-center gap-2">
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate text-sm font-medium">产物文件</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {artifacts.length > 0 ? (
              <span className="mr-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {artifacts.length} 个文件
              </span>
            ) : null}
            <button
              type="button"
              title={maximized ? '还原面板宽度' : '铺满整个任务页'}
              aria-label={maximized ? '还原面板宽度' : '铺满整个任务页'}
              onClick={() => setMaximized((value) => !value)}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {maximized ? (
                <Minimize2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Maximize2 className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              title="收起"
              aria-label="收起产物面板"
              onClick={onClose}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col bg-background">
            {active ? (
              <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-3 text-xs text-muted-foreground">
                <FileIconFor file={active} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{active.path || active.title}</span>
                <span className="ml-auto shrink-0">{formatSize(active.size)}</span>
              </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-auto">{renderPreview()}</div>
          </div>

          {showFileList ? (
          <div className="flex w-[240px] shrink-0 flex-col border-l border-border">
            <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-border px-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              文件
            </div>
            <div className="flex-1 overflow-y-auto p-1.5">
              {artifacts.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center">
                  <Inbox className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
                  <p className="text-[11px] text-muted-foreground">工作目录还没有文件</p>
                </div>
              ) : (
                artifacts.map((artifact) => {
                  const name = artifact.path.split('/').pop() ?? artifact.title
                  const isActive = artifact.id === activeId
                  return (
                    <button
                      key={artifact.id}
                      type="button"
                      title={artifact.path}
                      onClick={() => onSelect(artifact.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-xs transition-colors hover:bg-secondary',
                        isActive && 'bg-secondary'
                      )}
                    >
                      <FileIconFor
                        file={artifact}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{name}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          {formatSize(artifact.size)}
                        </span>
                      </span>
                    </button>
                  )
                })
              )}
            </div>
          </div>
          ) : null}
        </div>
      </aside>
    </>
  )
}
