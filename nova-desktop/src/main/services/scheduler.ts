/**
 * 定时任务调度器。
 * 每 30 秒检查一次：三个固定任务到达当天执行时间且今天尚未跑过时触发一次；
 * 应用启动晚于执行时间（当天错过）也会补跑一次。
 */
import type { BrowserWindow } from 'electron'
import { IPC_EVENT } from '@shared/ipc-channels'
import type { AnalysisEvent } from '@shared/types/analysis'
import type { Role } from '@shared/types/auth'
import { getSession as getAuthUser } from '../services/auth'
import { getSettings } from '../services/settings'
import { createNotification } from '../services/notifier'
import {
  TASK_DEFINITIONS,
  buildNotificationDescription,
  buildScheduledPrompt,
  isTaskDue,
  resolveTaskRange,
  type TaskDefinition
} from '../services/task-schedule'
import { getSession as getAgentSession, updateSession } from '../agent/session-store'
import { sendMessage, type EventSink } from '../agent/runtime'

const TICK_INTERVAL_MS = 30_000

let timer: NodeJS.Timeout | null = null

/** 正在触发的任务，避免同一分钟内重复发起 */
const inFlight = new Set<string>()

/** 启动调度器；重复调用会先清掉旧定时器 */
export function startScheduler(getWindow: () => BrowserWindow | null): void {
  stopScheduler()
  const tick = (): void => {
    void runDueTasks(getWindow)
  }
  timer = setInterval(tick, TICK_INTERVAL_MS)
  tick()
}

/** 停止调度器（应用退出时调用） */
export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 检查三个固定任务并触发到期的那些 */
async function runDueTasks(getWindow: () => BrowserWindow | null): Promise<void> {
  const user = await getAuthUser()
  if (!user) return

  const settings = await getSettings()
  const now = new Date()

  for (const task of TASK_DEFINITIONS) {
    if (inFlight.has(task.id)) continue

    try {
      const session = await getAgentSession(task.id)
      if (
        !isTaskDue({
          type: task.type,
          schedule: settings.task,
          now,
          status: session.status,
          lastRunAt: session.lastRunAt
        })
      ) {
        continue
      }
      void runTask(task, user.role, getWindow)
    } catch (error) {
      console.error(`[scheduler] check ${task.id} failed`, error)
    }
  }
}

/** 触发一次定时分析；状态与通知由运行时事件回传 */
async function runTask(
  task: TaskDefinition,
  role: Role,
  getWindow: () => BrowserWindow | null
): Promise<void> {
  inFlight.add(task.id)
  const now = new Date()
  const range = resolveTaskRange(task.type, now)

  try {
    // 先刷新展示用数据范围，再发送定时提示词
    await updateSession(task.id, { rangeLabel: range.rangeLabel })
    await sendMessage({
      sessionId: task.id,
      content: buildScheduledPrompt(task.type, now),
      role,
      sink: createSink(task, getWindow)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    await createNotification({
      title: `${task.title}执行失败`,
      description: message,
      taskId: task.id
    })
  } finally {
    inFlight.delete(task.id)
  }
}

/** 把运行事件转发到窗口，并在结束时写入通知 */
function createSink(
  task: TaskDefinition,
  getWindow: () => BrowserWindow | null
): EventSink {
  return (event: AnalysisEvent): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) {
      window.webContents.send(IPC_EVENT.analysisEvent, event)
    }

    if (event.type === 'run.end' && event.sessionId === task.id) {
      void notifyRunFinished(task, event.status, event.error)
    }
  }
}

/** 运行结束通知：成功写报告提醒，失败写错误原因；手动停止不打扰 */
async function notifyRunFinished(
  task: TaskDefinition,
  status: 'done' | 'failed' | 'stopped',
  error?: string
): Promise<void> {
  if (status === 'stopped') return

  if (status === 'done') {
    await createNotification({
      title: `${task.title}已生成`,
      description: buildNotificationDescription(task.type, new Date()),
      taskId: task.id
    })
    return
  }

  await createNotification({
    title: `${task.title}执行失败`,
    description: error ?? '请打开任务查看详情',
    taskId: task.id
  })
}
