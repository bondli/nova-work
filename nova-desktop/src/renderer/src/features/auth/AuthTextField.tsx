import { useState, type ChangeEvent, type ComponentProps, type ReactNode } from 'react'
import { Eye, EyeOff, X, type LucideIcon } from 'lucide-react'
import { FormItem, FormLabel, FormMessage, useFormField } from '@renderer/components/ui/form'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

interface AuthTextFieldProps extends ComponentProps<typeof Input> {
  label: string
  icon: LucideIcon
  action?: ReactNode
}

/**
 * 登录 / 注册表单的通用输入项：左侧图标 + 标签右侧附加操作 + 校验错误。
 * 必须在 FormField 的 render 内使用，内部依赖 useFormField 获取字段上下文。
 * 有内容时右侧提供一键清除；type 为 password 时额外提供查看明文的切换按钮。
 */
export function AuthTextField({
  label,
  icon: Icon,
  action,
  className,
  type,
  value,
  onChange,
  ...props
}: AuthTextFieldProps) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField()
  const [visible, setVisible] = useState(false)
  const isPassword = type === 'password'
  const hasValue = String(value ?? '').length > 0

  const clear = (): void => {
    onChange?.({ target: { value: '' } } as ChangeEvent<HTMLInputElement>)
  }

  return (
    <FormItem>
      <div className="flex items-center justify-between">
        <FormLabel className="text-ui">{label}</FormLabel>
        {action}
      </div>
      <div className="relative">
        <Icon
          className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-subtle"
          aria-hidden="true"
        />
        <Input
          id={formItemId}
          aria-describedby={error ? formMessageId : formDescriptionId}
          aria-invalid={Boolean(error)}
          type={isPassword && visible ? 'text' : type}
          value={value}
          onChange={onChange}
          // 清除按钮统一由本组件渲染，避免与 Input 内置的清除按钮重复
          clearable={false}
          className={cn(
            'h-10 pl-9',
            isPassword && hasValue ? 'pr-[4.5rem]' : hasValue ? 'pr-9' : '',
            className
          )}
          {...props}
        />
        {hasValue || isPassword ? (
          <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-0.5">
            {hasValue ? (
              <button
                type="button"
                tabIndex={-1}
                title="清除"
                aria-label={`清除${label}`}
                onClick={clear}
                className="flex h-7 w-7 items-center justify-center rounded text-subtle transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {isPassword ? (
              <button
                type="button"
                tabIndex={-1}
                title={visible ? '隐藏密码' : '显示密码'}
                aria-label={visible ? '隐藏密码' : '显示密码'}
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              >
                {visible ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <FormMessage className="text-meta" />
    </FormItem>
  )
}
