import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/utils'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Markdown 渲染组件
 * - 支持 GFM（表格 / 任务列表 / 删除线 / 代码围栏）
 * - 代码块：等宽字体 + bg-muted + 横向滚动
 * - 行内代码：bg-muted/60 + 圆角
 * - 表格：边框 + 横向滚动
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div className={cn('markdown-body text-message leading-relaxed', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

          // 标题与代码用 em 相对字号，跟随正文字号设置等比缩放
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 text-[1.286em] font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-3 text-[1.143em] font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-2 text-[1em] font-semibold first:mt-0">{children}</h3>
          ),

          ul: ({ children }) => <ul className="mb-2 list-disc space-y-0.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal space-y-0.5 pl-5">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,

          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border pl-3 text-muted-foreground">
              {children}
            </blockquote>
          ),

          code: ({ className: codeClassName, children, ...props }) => {
            const isBlock = /language-/.test(codeClassName ?? '')
            const text = String(children).replace(/\n$/, '')
            if (isBlock) {
              return (
                <pre className="my-2 overflow-x-auto rounded-md bg-muted p-3">
                  <code className={cn('text-[0.857em] leading-relaxed', codeClassName)}>{text}</code>
                </pre>
              )
            }
            return (
              <code
                className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[0.857em]"
                {...props}
              >
                {text}
              </code>
            )
          },

          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[0.857em]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/50 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,

          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:text-primary/80"
              target="_blank"
              rel="noreferrer"
            >
              {children}
            </a>
          ),

          hr: () => <hr className="my-3 border-border" />,

          input: ({ type, checked }) => {
            if (type === 'checkbox') {
              return (
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  readOnly
                  className="mr-1 h-3.5 w-3.5 rounded border-input"
                />
              )
            }
            return null
          }
        }}
      >
        {content || ''}
      </ReactMarkdown>
    </div>
  )
}
