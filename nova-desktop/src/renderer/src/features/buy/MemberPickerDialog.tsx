import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { BuyMember } from '@shared/types/buy'
import type { Member } from '@shared/types/member'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { formatMoney } from '@renderer/lib/format'
import { StatusBadge } from '@renderer/components/common/StatusBadge'
import { MEMBER_LEVEL } from '@renderer/features/members/labels'
import { memberKeys } from '@renderer/features/members/queries'
import { MEMBER_LEVEL_SHORT } from './labels'
import { createMember, loadBuyMember, searchMembers } from './api'

interface MemberPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (member: BuyMember) => void
}

/**
 * 收银台选择会员。
 * 打开时不查询，导购输入手机号回车后才查；
 * 查不到时询问是否入会，确认后写入会员表并直接选为本单会员。
 */
export function MemberPickerDialog({ open, onOpenChange, onSelect }: MemberPickerDialogProps) {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  /** 手机号格式错误提示，输入变化时清除 */
  const [phoneError, setPhoneError] = useState<string | null>(null)
  /** null 表示尚未查询，[] 表示查无此人 */
  const [results, setResults] = useState<Member[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmPhone, setConfirmPhone] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    setKeyword('')
    setPhoneError(null)
    setResults(null)
    setSearching(false)
    setLoadingId(null)
    setConfirmPhone(null)
  }, [open])

  async function handleSearch(): Promise<void> {
    const phone = keyword.trim()
    if (!phone) {
      setPhoneError('请输入会员手机号')
      toast.error('请输入会员手机号')
      return
    }
    if (!/^\d{11}$/.test(phone)) {
      setPhoneError('手机号需为 11 位数字，请检查输入')
      toast.error('手机号需为 11 位数字，请检查输入')
      return
    }
    setPhoneError(null)

    setSearching(true)
    try {
      const list = await searchMembers(phone)
      setResults(list)
      if (list.length === 0) setConfirmPhone(phone)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '会员查询失败')
    } finally {
      setSearching(false)
    }
  }

  async function choose(id: string): Promise<void> {
    setLoadingId(id)
    try {
      const member = await loadBuyMember(id)
      if (!member) {
        toast.error('会员不存在，请刷新后重试')
        return
      }
      onSelect(member)
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '会员信息加载失败')
    } finally {
      setLoadingId(null)
    }
  }

  /** 确认入会：写入会员表后直接加载权益并选为本单会员 */
  async function confirmCreate(): Promise<void> {
    const phone = confirmPhone
    if (!phone) return

    setCreating(true)
    try {
      await createMember(phone)
      const member = await loadBuyMember(phone)
      if (!member) throw new Error('会员已创建但读取失败，请重新搜索')
      // 新会员已落库，会员中心列表需要重新拉取
      void queryClient.invalidateQueries({ queryKey: memberKeys.all })
      setConfirmPhone(null)
      onSelect(member)
      onOpenChange(false)
      toast.success('已加入会员并选为本单会员')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '会员创建失败')
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>选择会员</DialogTitle>
            <DialogDescription>
              输入手机号后回车查询；未注册的会员可确认后直接加入。
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void handleSearch()
            }}
          >
            <div className="relative">
              {searching ? (
                <Loader2
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 animate-spin text-primary"
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <Input
                autoFocus
                className="h-10 pl-9"
                placeholder="手机号，回车查询"
                aria-label="搜索会员"
                aria-invalid={phoneError !== null}
                value={keyword}
                disabled={searching}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setPhoneError(null)
                  setResults(null)
                }}
              />
            </div>
            {phoneError ? (
              <p className="mt-1.5 text-meta text-destructive">{phoneError}</p>
            ) : null}
          </form>

          <div className="max-h-[320px] space-y-1 overflow-y-auto">
            {results === null ? (
              <p className="py-8 text-center text-ui text-muted-foreground">
                输入手机号后回车查询会员
              </p>
            ) : results.length === 0 ? (
              <p className="py-8 text-center text-ui text-muted-foreground">未找到匹配会员</p>
            ) : (
              results.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  disabled={loadingId !== null}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface disabled:opacity-60"
                  onClick={() => void choose(member.id)}
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ui font-semibold text-white"
                    style={{ backgroundColor: member.colorHex }}
                  >
                    {member.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-ui font-medium">{member.name}</span>
                      <StatusBadge status={MEMBER_LEVEL[member.level].tone}>
                        {MEMBER_LEVEL_SHORT[member.level]}
                      </StatusBadge>
                    </span>
                    <span className="mt-0.5 block text-meta text-muted-foreground">
                      {member.phone} · 余额 {formatMoney(member.balance, { decimals: 0 })} · 积分{' '}
                      {member.points.toLocaleString('zh-CN')}
                    </span>
                  </span>
                  <span className="inline-flex h-8 shrink-0 items-center rounded-md border border-input bg-background px-3 text-meta font-medium">
                    选择
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmPhone !== null}
        onOpenChange={(next) => {
          if (!next) setConfirmPhone(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>该手机号还不是会员</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPhone} 未查到会员记录，是否加入会员？确认后写入会员表，并作为本单会员。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={creating}
              onClick={(event) => {
                event.preventDefault()
                void confirmCreate()
              }}
            >
              {creating ? '加入中…' : '确认加入'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
