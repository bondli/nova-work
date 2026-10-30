import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@renderer/components/ui/form'
import { PasswordInput } from '@renderer/components/common/PasswordInput'
import { unwrap } from '@renderer/lib/ipc'
import { useAuthStore } from '@renderer/stores/auth-store'
import { useUiStore } from '@renderer/stores/ui-store'

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入原密码'),
    newPassword: z.string().min(8, '新密码至少 8 位').max(64, '新密码过长'),
    confirmPassword: z.string().min(1, '请再次输入新密码')
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: '两次输入的新密码不一致',
    path: ['confirmPassword']
  })

type ChangePasswordValues = z.infer<typeof changePasswordSchema>

/**
 * 修改密码弹窗。
 * 成功后主进程会清除会话，这里重新 bootstrap 登录态以回到登录页。
 */
export function ChangePasswordDialog() {
  const open = useUiStore((state) => state.dialogs.password)
  const setDialogOpen = useUiStore((state) => state.setDialogOpen)

  const form = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' }
  })

  const onSubmit = async (values: ChangePasswordValues): Promise<void> => {
    try {
      unwrap(
        await window.nova.auth.changePassword({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword
        })
      )
      form.reset()
      setDialogOpen('password', false)
      toast.success('密码已修改，请重新登录')
      await useAuthStore.getState().bootstrap()
    } catch (error) {
      form.setError('root', {
        message: error instanceof Error ? error.message : '密码修改失败'
      })
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        setDialogOpen('password', next)
      }}
    >
      <DialogContent className="w-[460px] max-w-[calc(100vw-48px)]">
        <DialogHeader>
          <DialogTitle className="text-title font-semibold">修改密码</DialogTitle>
          <DialogDescription className="text-meta text-muted-foreground">
            修改成功后需要使用新密码重新登录
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-ui">原密码</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage className="text-meta" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-ui">新密码</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage className="text-meta" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-ui">确认新密码</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage className="text-meta" />
                </FormItem>
              )}
            />

            {form.formState.errors.root ? (
              <Alert variant="destructive">
                <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter className="pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset()
                  setDialogOpen('password', false)
                }}
              >
                取消
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                确认修改
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
