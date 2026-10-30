import { describe, expect, it } from 'vitest'
import {
  buildScheduledPrompt,
  formatScheduleLabel,
  isTaskDue,
  resolveTaskRange
} from './task-schedule'

const SCHEDULE = { daily: '21:20', weekly: '10:10', monthly: '10:20' }

/** 本地时间构造，避免时区差异导致断言漂移 */
function at(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

describe('定时任务时间文案', () => {
  it('按设置生成三类任务文案', () => {
    expect(formatScheduleLabel('daily', SCHEDULE)).toBe('每晚 21:20')
    expect(formatScheduleLabel('weekly', SCHEDULE)).toBe('每周一 10:10')
    expect(formatScheduleLabel('monthly', SCHEDULE)).toBe('每月 1 日 10:20')
  })
})

describe('isTaskDue', () => {
  it('日报到点后触发', () => {
    expect(
      isTaskDue({ type: 'daily', schedule: SCHEDULE, now: at(2026, 10, 26, 21, 25), status: 'idle' })
    ).toBe(true)
  })

  it('日报未到点不触发', () => {
    expect(
      isTaskDue({ type: 'daily', schedule: SCHEDULE, now: at(2026, 10, 26, 21, 10), status: 'idle' })
    ).toBe(false)
  })

  it('当天已跑过不重复触发', () => {
    expect(
      isTaskDue({
        type: 'daily',
        schedule: SCHEDULE,
        now: at(2026, 10, 26, 21, 25),
        status: 'completed',
        lastRunAt: at(2026, 10, 26, 21, 21).toISOString()
      })
    ).toBe(false)
  })

  it('昨天跑过、今天错过时间仍会补跑', () => {
    expect(
      isTaskDue({
        type: 'daily',
        schedule: SCHEDULE,
        now: at(2026, 10, 26, 22, 30),
        status: 'completed',
        lastRunAt: at(2026, 10, 25, 21, 21).toISOString()
      })
    ).toBe(true)
  })

  it('运行中不重复发起', () => {
    expect(
      isTaskDue({
        type: 'daily',
        schedule: SCHEDULE,
        now: at(2026, 10, 26, 21, 25),
        status: 'running'
      })
    ).toBe(false)
  })

  it('周报只在周一触发', () => {
    expect(
      isTaskDue({ type: 'weekly', schedule: SCHEDULE, now: at(2026, 10, 26, 10, 30), status: 'idle' })
    ).toBe(true)
    expect(
      isTaskDue({ type: 'weekly', schedule: SCHEDULE, now: at(2026, 10, 27, 10, 30), status: 'idle' })
    ).toBe(false)
  })

  it('月报只在每月 1 号触发', () => {
    expect(
      isTaskDue({ type: 'monthly', schedule: SCHEDULE, now: at(2026, 11, 1, 10, 30), status: 'idle' })
    ).toBe(true)
    expect(
      isTaskDue({ type: 'monthly', schedule: SCHEDULE, now: at(2026, 10, 26, 10, 30), status: 'idle' })
    ).toBe(false)
  })
})

describe('resolveTaskRange', () => {
  it('日报取当天', () => {
    expect(resolveTaskRange('daily', at(2026, 10, 26, 21, 20))).toEqual({
      start: '2026-10-26',
      end: '2026-10-26',
      rangeLabel: '10/26'
    })
  })

  it('周一执行周报取上周一到周日', () => {
    expect(resolveTaskRange('weekly', at(2026, 10, 26, 10, 10))).toEqual({
      start: '2026-10-19',
      end: '2026-10-25',
      rangeLabel: '10/19 - 10/25'
    })
  })

  it('每月 1 号执行月报取上月整月', () => {
    expect(resolveTaskRange('monthly', at(2026, 11, 1, 10, 20))).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
      rangeLabel: '10/01 - 10/31'
    })
  })
})

describe('buildScheduledPrompt', () => {
  it('提示词包含数据范围、工具与产物路径', () => {
    const prompt = buildScheduledPrompt('daily', at(2026, 10, 26, 21, 20))
    expect(prompt).toContain('2026-10-26')
    expect(prompt).toContain('get_business_overview')
    expect(prompt).toContain('publish_artifact')
    expect(prompt).toContain('店铺经营日报-2026-10-26.html')
    expect(prompt).toContain('不要向我提问')
  })
})
