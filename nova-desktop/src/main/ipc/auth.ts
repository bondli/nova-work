import { ipcMain } from 'electron'
import { z } from 'zod'
import { IPC } from '@shared/ipc-channels'
import { AuthServiceError, changePassword, getSession, login, logout, register } from '../services/auth'
import { failure, internalFailure, success } from './helpers'

/**
 * 登录 / 注册 / 会话相关 IPC 处理器。
 * 所有入参先经过 zod 校验，业务异常统一转换为带错误码的 IpcResult。
 */

const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入用户名').max(64, '用户名过长'),
  password: z.string().min(1, '请输入密码').max(128, '密码过长'),
  remember: z.boolean().default(true)
})

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9]{4,20}$/, '用户名需为 4-20 位字母或数字'),
  name: z.string().trim().min(1, '请输入姓名').max(20, '姓名过长'),
  password: z.string().min(8, '密码至少 8 位').max(64, '密码过长')
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入原密码').max(128, '密码过长'),
  newPassword: z.string().min(8, '新密码至少 8 位').max(64, '密码过长')
})

/** 将 AuthServiceError 转成业务错误，其他异常交给兜底处理 */
function toFailure<T>(error: unknown) {
  if (error instanceof AuthServiceError) return failure<T>(error.code, error.message)
  return internalFailure<T>(error)
}

/** 注册登录、注册、会话、登出、修改密码五个处理器 */
export function registerAuthIpc(): void {
  ipcMain.handle(IPC.authLogin, async (_event, input: unknown) => {
    const parsed = loginSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '登录参数不合法')
    }
    try {
      return success(await login(parsed.data))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.authRegister, async (_event, input: unknown) => {
    const parsed = registerSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '注册参数不合法')
    }
    try {
      return success(await register(parsed.data))
    } catch (error) {
      return toFailure(error)
    }
  })

  ipcMain.handle(IPC.authLogout, async () => {
    try {
      await logout()
      return success(null)
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.authSession, async () => {
    try {
      return success(await getSession())
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.authChangePassword, async (_event, input: unknown) => {
    const parsed = changePasswordSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '改密参数不合法')
    }
    try {
      await changePassword(parsed.data)
      return success(null)
    } catch (error) {
      return toFailure(error)
    }
  })
}
