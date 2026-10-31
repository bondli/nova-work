import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Lock, UserRound } from 'lucide-react'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import { Form, FormField } from '@renderer/components/ui/form'
import { useAuthStore } from '@renderer/stores/auth-store'
import { AuthTextField } from './AuthTextField'

const loginSchema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
  remember: z.boolean()
})

type LoginValues = z.infer<typeof loginSchema>

/** 上次勾选「记住我」登录成功的账号，下次打开登录页自动填入 */
const LAST_USERNAME_KEY = 'nova.lastUsername'

function readLastUsername(): string {
  try {
    return localStorage.getItem(LAST_USERNAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function writeLastUsername(username: string, remember: boolean): void {
  try {
    if (remember) localStorage.setItem(LAST_USERNAME_KEY, username)
    else localStorage.removeItem(LAST_USERNAME_KEY)
  } catch {
    // 缓存不可用时忽略，不影响登录
  }
}

interface LoginFormProps {
  onSwitchMode: () => void
  /** 提交前保存登录页修改的服务地址；失败时按登录失败展示 */
  beforeSubmit?: () => Promise<void>
}

/**
 * 登录表单：用户名 + 密码 + 记住我。
 * 登录失败的错误展示在表单顶部的 Alert 中，而不是字段级错误。
 */
export function LoginForm({ onSwitchMode, beforeSubmit }: LoginFormProps) {
  const login = useAuthStore((state) => state.login)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: readLastUsername(), password: '', remember: true }
  })

  const onSubmit = async (values: LoginValues): Promise<void> => {
    try {
      await beforeSubmit?.()
      await login(values)
      writeLastUsername(values.username.trim(), values.remember)
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : '登录失败，请稍后重试'
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-7 space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <AuthTextField
              label="用户名"
              icon={UserRound}
              placeholder="请输入用户名"
              autoComplete="username"
              autoFocus
              {...field}
            />
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <AuthTextField
              label="密码"
              icon={Lock}
              type="password"
              placeholder="请输入密码"
              autoComplete="current-password"
              {...field}
            />
          )}
        />

        <div className="flex items-center justify-between text-ui">
          <label className="flex items-center gap-2 text-muted-foreground">
            <Checkbox
              checked={form.watch('remember')}
              onCheckedChange={(checked) => form.setValue('remember', checked === true)}
            />
            记住我
          </label>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => toast.info('请联系管理员重置密码')}
          >
            忘记密码？
          </button>
        </div>

        {form.formState.errors.root ? (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '登录中…' : '登录'}
        </Button>
      </form>

      <p className="mt-5 text-center text-ui text-muted-foreground">
        还没有账号？
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-ui font-medium"
          onClick={onSwitchMode}
        >
          立即注册
        </Button>
      </p>
    </Form>
  )
}
