import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { IdCard, Lock, LockKeyhole, UserRound } from 'lucide-react'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import { Form, FormField } from '@renderer/components/ui/form'
import { useAuthStore } from '@renderer/stores/auth-store'
import { AuthTextField } from './AuthTextField'

const registerSchema = z
  .object({
    username: z
      .string()
      .min(1, '请输入用户名')
      .regex(/^[a-zA-Z0-9]{4,20}$/, '用户名需为 4-20 位字母或数字'),
    name: z.string().min(1, '请输入姓名').max(20, '姓名不能超过 20 个字'),
    password: z.string().min(8, '密码至少 8 位').max(64, '密码过长'),
    confirmPassword: z.string().min(1, '请再次输入密码')
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword']
  })

type RegisterValues = z.infer<typeof registerSchema>

interface RegisterFormProps {
  onSwitchMode: () => void
}

/**
 * 注册表单：用户名、姓名、密码、确认密码。
 * 校验规则与主进程一致；注册成功后自动登录，新账号默认为导购员。
 */
export function RegisterForm({ onSwitchMode }: RegisterFormProps) {
  const registerUser = useAuthStore((state) => state.register)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: '', name: '', password: '', confirmPassword: '' }
  })

  const onSubmit = async (values: RegisterValues): Promise<void> => {
    try {
      await registerUser({
        username: values.username,
        name: values.name,
        password: values.password
      })
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : '注册失败，请稍后重试'
      })
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-3">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <AuthTextField
              label="用户名"
              icon={UserRound}
              placeholder="4-20 位字母或数字"
              autoComplete="username"
              autoFocus
              {...field}
            />
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <AuthTextField
              label="姓名"
              icon={IdCard}
              placeholder="请输入真实姓名"
              autoComplete="name"
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
              placeholder="至少 8 位，建议含字母和数字"
              autoComplete="new-password"
              {...field}
            />
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <AuthTextField
              label="确认密码"
              icon={LockKeyhole}
              type="password"
              placeholder="请再次输入密码"
              autoComplete="new-password"
              {...field}
            />
          )}
        />

        {form.formState.errors.root ? (
          <Alert variant="destructive">
            <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="h-10 w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? '注册中…' : '注册并登录'}
        </Button>
      </form>

      <p className="mt-4 text-center text-ui text-muted-foreground">
        已有账号？
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-ui font-medium"
          onClick={onSwitchMode}
        >
          返回登录
        </Button>
      </p>
    </Form>
  )
}
