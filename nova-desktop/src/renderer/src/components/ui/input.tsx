import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@renderer/lib/utils"

const INPUT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-ui shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40"

/** 从调用方 className 中提取尺寸类，供外层容器复用，避免布局宽度丢失 */
function layoutClasses(className?: string): string {
  if (!className) return ""
  return className
    .split(/\s+/)
    .filter((token) => /^(?:w|min-w|max-w|flex|basis|grow|shrink|col|row|self|order)-/.test(token))
    .join(" ")
}

function Input({
  className,
  type,
  value,
  onChange,
  disabled,
  readOnly,
  ref,
  clearable = true,
  ...props
}: React.ComponentProps<"input"> & { clearable?: boolean }) {
  // 仅纯文本输入框支持一键清空，number / date / password 等保持原生行为
  const isText = type === undefined || type === "text"

  if (!isText) {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(INPUT_CLASS, className)}
        value={value}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        {...props}
      />
    )
  }

  const showClear =
    clearable &&
    !disabled &&
    !readOnly &&
    typeof value === "string" &&
    value.length > 0 &&
    typeof onChange === "function"

  /** 通过伪造 change 事件清空受控输入，兼容调用方各自的状态管理 */
  function handleClear(): void {
    onChange?.({ target: { value: "" } } as unknown as React.ChangeEvent<HTMLInputElement>)
  }

  return (
    <div className={cn("relative w-full", layoutClasses(className))}>
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(INPUT_CLASS, showClear && "pr-8", className)}
        value={value}
        onChange={onChange}
        disabled={disabled}
        readOnly={readOnly}
        {...props}
      />
      {showClear ? (
        <button
          type="button"
          tabIndex={-1}
          title="清空"
          aria-label="清空输入"
          onClick={handleClear}
          className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export { Input }
