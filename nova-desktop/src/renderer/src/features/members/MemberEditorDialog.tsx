import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { zhCN } from 'react-day-picker/locale'
import { CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import type { Member } from '@shared/types/member'
import { Button } from '@renderer/components/ui/button'
import { Calendar } from '@renderer/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { SheetDrawer } from '@renderer/components/common/SheetDrawer'
import { cn } from '@renderer/lib/utils'
import { formatDate, formatMoney } from '@renderer/lib/format'
import { useAuthStore } from '@renderer/stores/auth-store'
import {
  useCreateMember,
  useUpdateMemberBalance,
  useUpdateMemberPoint,
  useUpdateMemberProfile
} from './queries'

/** 资产调整方向，积分与余额共用，与老系统 schema 一致 */
const DIRECTION_OPTIONS: { value: 'manualAdd' | 'manualReduce'; label: string }[] = [
  { value: 'manualAdd', label: '手动增加' },
  { value: 'manualReduce', label: '手动减少' }
]

const INPUT_CLASS = 'h-8 text-ui'
const FORM_ID = 'member-editor-form'

/** 表单区块：灰色底 + 标题，对应老系统 Card 分块 */
function EditorSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="mb-3 text-ui font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

/** 把 YYYY-MM-DD 解析为本地 Date，避免 new Date('YYYY-MM-DD') 按 UTC 解析导致差一天 */
function parseISODate(value: string): Date | undefined {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!matched) return undefined
  return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
}

interface BirthdayPickerProps {
  id: string
  value: string
  onChange: (value: string) => void
}

/** 生日可选年份下限，早于 2012 的年份不出现在年份下拉中 */
const BIRTHDAY_START_MONTH = new Date(2012, 0, 1)

/** 未选生日或早于下限时，默认停在可选范围内的起点 */
function initialMonth(selected: Date | undefined): Date {
  if (!selected || selected < BIRTHDAY_START_MONTH) return BIRTHDAY_START_MONTH
  return selected
}

/** 生日选择：Popover + 单月日历，值统一为 YYYY-MM-DD 字符串 */
function BirthdayPicker({ id, value, onChange }: BirthdayPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? parseISODate(value) : undefined
  const [month, setMonth] = useState<Date>(() => initialMonth(selected))

  /** 每次打开都回到已选月份，未选过则停在 2012-01 便于快速选择 */
  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setMonth(initialMonth(selected))
    setOpen(nextOpen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-full justify-start gap-1.5 bg-transparent font-normal"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
          <span className={cn('text-ui', !value && 'text-muted-foreground')}>
            {value || '选择生日'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(formatDate(date))
            setOpen(false)
          }}
          month={month}
          onMonthChange={setMonth}
          captionLayout="dropdown"
          startMonth={BIRTHDAY_START_MONTH}
          endMonth={new Date()}
          disabled={{ after: new Date() }}
          weekStartsOn={1}
          locale={zhCN}
          className="p-0"
          classNames={{
            caption_label: 'flex h-8 items-center gap-1 text-ui font-medium',
            // 年月下拉去掉输入框式边框，避免日历头部出现多余的描边
            dropdown_root: 'relative rounded-md border-0 shadow-none bg-transparent'
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

interface MemberEditorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Member | null
}

/**
 * 会员编辑抽屉：基本信息 + 积分 + 余额三块，可修改项与老系统 Editor 一致。
 * 积分 / 余额涉及资产调整，仅管理员可见可提交。
 * 确定时按块提交：基本信息始终提交，积分 / 余额仅提交已填写变动的块。
 */
export function MemberEditorDialog({ open, onOpenChange, member }: MemberEditorDialogProps) {
  const role = useAuthStore((state) => state.user?.role)
  const isAdmin = role === 'admin'

  const profileMutation = useUpdateMemberProfile()
  const pointMutation = useUpdateMemberPoint()
  const balanceMutation = useUpdateMemberBalance()

  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [changePoint, setChangePoint] = useState('')
  const [pointType, setPointType] = useState<'manualAdd' | 'manualReduce'>('manualAdd')
  const [pointReason, setPointReason] = useState('')
  const [changeBalance, setChangeBalance] = useState('')
  const [balanceType, setBalanceType] = useState<'manualAdd' | 'manualReduce'>('manualAdd')
  const [balanceReason, setBalanceReason] = useState('')
  const [formError, setFormError] = useState('')

  // 打开或切换会员时用最新数据回填并清空所有变动输入
  useEffect(() => {
    if (!open) return
    setName(member?.name ?? '')
    setBirthday(member?.birthday ?? '')
    setChangePoint('')
    setPointType('manualAdd')
    setPointReason('')
    setChangeBalance('')
    setBalanceType('manualAdd')
    setBalanceReason('')
    setFormError('')
  }, [open, member?.id, member?.name, member?.birthday])

  const submitting =
    profileMutation.isPending || pointMutation.isPending || balanceMutation.isPending

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!member) return

    const pointValue = changePoint.trim() ? Number(changePoint) : 0
    const balanceValue = changeBalance.trim() ? Number(changeBalance) : 0

    if (changePoint.trim() && (!Number.isFinite(pointValue) || pointValue <= 0)) {
      setFormError('变动积分需大于 0')
      return
    }
    if (changeBalance.trim() && (!Number.isFinite(balanceValue) || balanceValue <= 0)) {
      setFormError('变动金额需大于 0')
      return
    }

    setFormError('')
    try {
      // 基本信息始终提交，与老系统「基本信息」区块的确定行为一致
      await profileMutation.mutateAsync({ phone: member.phone, name, birthday })

      if (pointValue > 0) {
        await pointMutation.mutateAsync({
          phone: member.phone,
          changePoint: pointValue,
          type: pointType,
          reason: pointReason || '手动调整积分'
        })
      }

      if (balanceValue > 0) {
        await balanceMutation.mutateAsync({
          phone: member.phone,
          changeBalance: balanceValue,
          type: balanceType,
          reason: balanceReason || '手动调整余额'
        })
      }

      toast.success('会员信息已更新')
      onOpenChange(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新失败，请稍后重试'
      setFormError(message)
      toast.error(message)
    }
  }

  return (
    <SheetDrawer
      open={open}
      onOpenChange={onOpenChange}
      width="lg"
      title="修改会员"
      description={member ? `${member.name} · ${member.phone}` : '请选择要修改的会员'}
      bodyClassName="flex min-h-0 flex-col gap-3"
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            关闭
          </Button>
          <Button type="submit" form={FORM_ID} size="sm" disabled={submitting || !member}>
            {submitting ? '提交中' : '确定'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-3">
        <EditorSection title="基本信息">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="member-phone" className="text-ui">
                手机号
              </Label>
              <Input
                id="member-phone"
                className={INPUT_CLASS}
                value={member?.phone ?? ''}
                disabled
                readOnly
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-name" className="text-ui">
                姓名
              </Label>
              <Input
                id="member-name"
                className={INPUT_CLASS}
                placeholder="输入会员姓名"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="member-birthday" className="text-ui">
                生日
              </Label>
              <BirthdayPicker id="member-birthday" value={birthday} onChange={setBirthday} />
            </div>
          </div>
        </EditorSection>

        {/* 积分与余额属于资产调整，仅管理员可见 */}
        {isAdmin ? (
          <EditorSection title="积分">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="member-point" className="text-ui">
                  当前积分
                </Label>
                <Input
                  id="member-point"
                  className={INPUT_CLASS}
                  value={(member?.points ?? 0).toLocaleString('zh-CN')}
                  disabled
                  readOnly
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-change-point" className="text-ui">
                  变动积分
                </Label>
                <Input
                  id="member-change-point"
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT_CLASS}
                  placeholder="输入变动积分"
                  value={changePoint}
                  onChange={(event) => setChangePoint(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-point-type" className="text-ui">
                  变动类型
                </Label>
                <Select
                  value={pointType}
                  onValueChange={(value) => setPointType(value as 'manualAdd' | 'manualReduce')}
                >
                  <SelectTrigger id="member-point-type" className={INPUT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-ui">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-point-reason" className="text-ui">
                  变动原因
                </Label>
                <Input
                  id="member-point-reason"
                  className={INPUT_CLASS}
                  placeholder="输入变动原因"
                  value={pointReason}
                  onChange={(event) => setPointReason(event.target.value)}
                />
              </div>
            </div>
          </EditorSection>
        ) : null}

        {isAdmin ? (
          <EditorSection title="余额">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="member-balance" className="text-ui">
                  当前余额
                </Label>
                <Input
                  id="member-balance"
                  className={INPUT_CLASS}
                  value={formatMoney(member?.balance ?? 0, { decimals: 0 })}
                  disabled
                  readOnly
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-change-balance" className="text-ui">
                  变动金额
                </Label>
                <Input
                  id="member-change-balance"
                  type="number"
                  min={0}
                  step={1}
                  className={INPUT_CLASS}
                  placeholder="输入变动金额"
                  value={changeBalance}
                  onChange={(event) => setChangeBalance(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-balance-type" className="text-ui">
                  变动类型
                </Label>
                <Select
                  value={balanceType}
                  onValueChange={(value) => setBalanceType(value as 'manualAdd' | 'manualReduce')}
                >
                  <SelectTrigger id="member-balance-type" className={INPUT_CLASS}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value} className="text-ui">
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="member-balance-reason" className="text-ui">
                  变动原因
                </Label>
                <Input
                  id="member-balance-reason"
                  className={INPUT_CLASS}
                  placeholder="输入变动原因"
                  value={balanceReason}
                  onChange={(event) => setBalanceReason(event.target.value)}
                />
              </div>
            </div>
          </EditorSection>
        ) : null}

        {formError ? <p className="text-meta text-destructive">{formError}</p> : null}
      </form>
    </SheetDrawer>
  )
}

interface NewMemberDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * 新增会员弹窗：手机号 / 姓名 / 生日，对应老系统 NewJoin。
 * 手机号为 11 位数字校验，重复手机号由服务端返回错误。
 */
export function NewMemberDialog({ open, onOpenChange }: NewMemberDialogProps) {
  const createMutation = useCreateMember()

  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [birthday, setBirthday] = useState('')
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setPhone('')
    setName('')
    setBirthday('')
    setFormError('')
  }, [open])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{11}$/.test(phone.trim())) {
      setFormError('请输入 11 位手机号')
      return
    }
    setFormError('')
    createMutation.mutate(
      { phone: phone.trim(), name, birthday },
      {
        onSuccess: () => {
          toast.success('新增会员成功')
          onOpenChange(false)
        },
        onError: (error) => {
          const message = error instanceof Error ? error.message : '新增会员失败'
          setFormError(message)
          toast.error(message)
        }
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[420px] max-w-[calc(100vw-48px)]">
        <DialogHeader>
          <DialogTitle className="text-title font-semibold">新增会员</DialogTitle>
          <DialogDescription className="text-meta text-muted-foreground">
            手机号唯一，重复录入会被拒绝
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-member-phone" className="text-ui">
              手机号
            </Label>
            <Input
              id="new-member-phone"
              className={INPUT_CLASS}
              placeholder="输入会员手机号"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-member-name" className="text-ui">
              姓名
            </Label>
            <Input
              id="new-member-name"
              className={INPUT_CLASS}
              placeholder="输入会员姓名"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-member-birthday" className="text-ui">
              生日
            </Label>
            <BirthdayPicker id="new-member-birthday" value={birthday} onChange={setBirthday} />
          </div>

          {formError ? <p className="text-meta text-destructive">{formError}</p> : null}

          <DialogFooter className="pt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
            >
              关闭
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? '提交中' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
