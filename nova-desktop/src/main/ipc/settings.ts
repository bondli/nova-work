import { ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { failure, internalFailure, success } from './helpers'
import { appSettingsSchema, applySettings, getSettings, saveSettings } from '../services/settings'
import {
  dataSettingsInputSchema,
  getDataSettingsView,
  saveDataSettings
} from '../services/data-config'
import {
  getModelConfigView,
  modelConfigInputSchema,
  saveModelConfig,
  testModelConnection
} from '../agent/config'
import { getSession } from '../services/auth'
import { clearPosToken } from '../api/pos-token'
import { getServerConfig } from '../services/server-config'

/**
 * 设置与应用级 IPC 处理器。
 * 入参必须通过 zod 校验；保存成功后立即应用到当前窗口（主题 / 开机自启）。
 * 定时任务、数据设置与模型设置仅管理员可改。
 */
export function registerSettingsIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.settingsGet, async () => {
    try {
      return success(await getSettings())
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.settingsSet, async (_event, input: unknown) => {
    const parsed = appSettingsSchema.safeParse(input)
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? '设置参数不合法'
      return failure('INVALID_INPUT', message)
    }

    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')

    try {
      const current = await getSettings()
      const taskChanged =
        current.task.daily !== parsed.data.task.daily ||
        current.task.weekly !== parsed.data.task.weekly ||
        current.task.monthly !== parsed.data.task.monthly
      if (taskChanged && user.role !== 'admin') {
        return failure('FORBIDDEN', '仅管理员可修改定时任务时间')
      }

      const saved = await saveSettings(parsed.data)
      applySettings(saved)
      return success(saved)
    } catch (error) {
      return internalFailure(error)
    }
  })

  // POS 服务地址：只暴露地址本身（不含数据库/令牌），商品图片预览等场景导购员也要用
  ipcMain.handle(IPC.dataConfigBaseUrl, async () => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')

    try {
      const { baseUrl } = await getServerConfig()
      return success(baseUrl)
    } catch (error) {
      return internalFailure(error)
    }
  })

  // 数据设置：POS 服务地址来自 server-config，数据库来自 agent-config，仅管理员可见
  ipcMain.handle(IPC.dataConfigGet, async () => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')
    if (user.role !== 'admin') return failure('FORBIDDEN', '仅管理员可查看数据设置')

    try {
      return success(await getDataSettingsView())
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.dataConfigSet, async (_event, input: unknown) => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')
    if (user.role !== 'admin') return failure('FORBIDDEN', '仅管理员可修改数据设置')

    const parsed = dataSettingsInputSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '数据设置不合法')
    }

    try {
      const saved = await saveDataSettings(parsed.data)
      // 服务端地址或令牌可能已变化，清空已缓存的 JWT
      clearPosToken()
      return success(saved)
    } catch (error) {
      return internalFailure(error)
    }
  })

  // 模型设置：读写 ~/.nova/agent-config.json 的 model 段，仅管理员可见
  ipcMain.handle(IPC.modelConfigGet, async () => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')
    if (user.role !== 'admin') return failure('FORBIDDEN', '仅管理员可查看模型设置')

    try {
      return success(await getModelConfigView())
    } catch (error) {
      return internalFailure(error)
    }
  })

  ipcMain.handle(IPC.modelConfigSet, async (_event, input: unknown) => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')
    if (user.role !== 'admin') return failure('FORBIDDEN', '仅管理员可修改模型设置')

    const parsed = modelConfigInputSchema.safeParse(input)
    if (!parsed.success) {
      return failure('INVALID_INPUT', parsed.error.issues[0]?.message ?? '模型设置不合法')
    }

    try {
      await saveModelConfig(parsed.data)
      return success(await getModelConfigView())
    } catch (error) {
      return internalFailure(error)
    }
  })

  // 测试模型连通性（GET /models），仅管理员可触发
  ipcMain.handle(IPC.modelConfigTest, async () => {
    const user = await getSession()
    if (!user) return failure('UNAUTHENTICATED', '请先登录')
    if (user.role !== 'admin') return failure('FORBIDDEN', '仅管理员可测试模型连接')

    try {
      return success(await testModelConnection())
    } catch (error) {
      return internalFailure(error)
    }
  })

  // 刷新应用：页面内的 location.reload() 会被 will-navigate 拦截，改由主进程重载
  ipcMain.handle(IPC.systemReload, () => {
    const window = getWindow()
    if (!window) return failure('INTERNAL_ERROR', '窗口不可用')

    // 先返回结果再重载，避免响应还没送到渲染层页面就被卸载
    setTimeout(() => {
      if (!window.isDestroyed()) window.webContents.reload()
    }, 0)
    return success(null)
  })
}
