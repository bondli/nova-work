import { useState } from 'react'
import type { DateRange as DayPickerRange } from 'react-day-picker'
import { zhCN } from 'react-day-picker/locale'
import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { formatDate, formatDateRange } from '@renderer/lib/format'

/** 日期区间值，统一使用本地 Date */
export interface DateRangeValue {
  start: Date
  end: Date
}

/** 快捷预设，仅在需要的数据页传入 */
export interface DateRangePreset {
  label: string
  start: Date
  end: Date
}

interface DateRangePickerProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  presets?: DateRangePreset[]
  numberOfMonths?: number
  align?: 'start' | 'center' | 'end'
  disabled?: boolean
  /** 允许选择未来日期，用于活动时间等可预约区间（筛选类默认禁止） */
  allowFuture?: boolean
  className?: string
}

/** 取某月 1 号，用于日历翻页定位 */
function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/**
 * 日期区间选择器：Popover + 双月日历。
 * 打开时把当前值复制到草稿，只有点「确定」才向上提交；取消或点外部则丢弃修改。
 */
export function DateRangePicker({
  value,
  onChange,
  presets,
  numberOfMonths = 2,
  align = 'start',
  disabled = false,
  allowFuture = false,
  className
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DayPickerRange>({ from: value.start, to: value.end })
  const [month, setMonth] = useState<Date>(() => startOfMonth(value.start))

  /** 打开时重置草稿与月份，保证每次看到的是已生效区间 */
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraft({ from: value.start, to: value.end })
      setMonth(startOfMonth(value.start))
    }
    setOpen(nextOpen)
  }

  /** 双月共用一个翻页控制，与 demo 的顶部左右箭头一致 */
  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
  }

  function handleConfirm() {
    if (!draft.from) return
    onChange({ start: draft.from, end: draft.to ?? draft.from })
    setOpen(false)
  }

  const selectedLabel = formatDateRange(value.start, value.end)
  /** 以今天为上限，禁止选择未来日期 */
  const today = new Date()

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label="选择日期区间"
          className={cn('h-8 gap-1.5 bg-transparent', className)}
        >
          <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="tnum text-ui">{selectedLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align={align} sideOffset={8} className="w-[520px] p-4">
        <div className="flex items-center justify-between">
          <p className="text-ui font-semibold">选择日期区间</p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="上一个月"
              onClick={() => shiftMonth(-1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="下一个月"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {presets?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  setDraft({ from: preset.start, to: preset.end })
                  setMonth(startOfMonth(preset.start))
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex gap-4">
          <Calendar
            mode="range"
            selected={draft}
            onSelect={(range) => setDraft(range ?? { from: undefined, to: undefined })}
            disabled={allowFuture ? undefined : { after: today }}
            month={month}
            onMonthChange={setMonth}
            numberOfMonths={numberOfMonths}
            showOutsideDays={false}
            weekStartsOn={1}
            locale={zhCN}
            className="p-0"
            classNames={{
              nav: 'hidden',
              caption_label: 'flex h-8 items-center justify-center text-ui font-medium',
              weekday: 'flex-1 rounded-md text-caption font-normal text-muted-foreground'
            }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
          <p className="text-meta text-muted-foreground">
            已选：
            <span className="tnum text-foreground">
              {draft.from ? formatDate(draft.from) : '开始日期'}
            </span>
            {' 至 '}
            <span className="tnum text-foreground">
              {draft.from ? formatDate(draft.to ?? draft.from) : '结束日期'}
            </span>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="button" size="sm" disabled={!draft.from} onClick={handleConfirm}>
              确定
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
