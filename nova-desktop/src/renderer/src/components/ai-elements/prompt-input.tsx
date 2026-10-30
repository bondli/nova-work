import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Check, ChevronDown, Cpu, Paperclip, Sparkles, Wrench, X } from 'lucide-react'
import { toast } from 'sonner'
import type { AgentCapabilities, AttachmentInput } from '@shared/types/analysis'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { cn } from '@renderer/lib/utils'

/** 与 nexa 保持一致：最多 4 张、单张 10MB */
const MAX_ATTACHMENTS = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

interface StagedImage {
  id: string
  name: string
  mimeType: string
  dataUrl: string
  size: number
}

interface PromptInputProps {
  value: string
  onValueChange: (value: string) => void
  /** 提交内容与附件；返回是否成功，成功后清空已选图片 */
  onSubmit: (options: {
    attachments?: AttachmentInput[]
    skillId?: string
  }) => Promise<boolean>
  isRunning: boolean
  /** 当前会话模型；为空时使用默认模型 */
  model: string | null
  onModelChange: (model: string) => void
  placeholder?: string
  className?: string
}

/**
 * 输入区：与 nexa 对齐。
 * 支持图片暂存（选择 / 粘贴 / 拖拽）、技能选择、模型切换与圆形发送按钮。
 */
export function PromptInput({
  value,
  onValueChange,
  onSubmit,
  isRunning,
  model,
  onModelChange,
  placeholder = '继续追问，或让 Nova 生成新的报表…',
  className
}: PromptInputProps) {
  const [staged, setStaged] = useState<StagedImage[]>([])
  const [dragging, setDragging] = useState(false)
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
  const [capabilities, setCapabilities] = useState<AgentCapabilities>({
    models: [],
    defaultModel: '',
    skills: []
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let active = true
    void window.nova.agent
      .capabilities()
      .then((result) => {
        if (active && result.ok) setCapabilities(result.data)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  const selectedSkill = capabilities.skills.find((skill) => skill.id === selectedSkillId)
  // 会话未指定模型时，输入区展示全局配置的默认模型
  const activeModel = model ?? capabilities.defaultModel
  const currentModel = capabilities.models.find((option) => option.id === activeModel)
  const currentModelLabel = currentModel?.label ?? (activeModel || '默认模型')

  /** 把用户选择/粘贴/拖入的图片读成 dataURL 后暂存 */
  function stageFiles(files: File[]): void {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (images.length === 0) {
      toast.warning('仅支持上传图片')
      return
    }

    for (const file of images) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.warning(`图片「${file.name}」超过 10MB`)
        continue
      }
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result !== 'string') return
        setStaged((previous) => {
          if (previous.length >= MAX_ATTACHMENTS) {
            toast.warning(`最多上传 ${MAX_ATTACHMENTS} 张图片`)
            return previous
          }
          return [
            ...previous,
            {
              id: `${Date.now()}-${file.name}-${previous.length}`,
              name: file.name,
              mimeType: file.type,
              dataUrl: reader.result as string,
              size: file.size
            }
          ]
        })
      }
      reader.onerror = () => toast.error(`读取图片「${file.name}」失败`)
      reader.readAsDataURL(file)
    }
  }

  async function handleSend(): Promise<void> {
    if (isRunning) return
    const text = value.trim()
    if (!text && staged.length === 0) return

    const ok = await onSubmit({
      attachments: staged.map((image) => ({
        name: image.name,
        mimeType: image.mimeType,
        dataUrl: image.dataUrl
      })),
      skillId: selectedSkill?.id
    })
    if (ok) setStaged([])
  }

  return (
    <div
      className={cn('relative shrink-0 border-t border-border bg-card px-6 py-3', className)}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (isRunning) return
        stageFiles(Array.from(event.dataTransfer.files))
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary/60 bg-primary/5 text-xs font-medium text-primary">
          松开以添加图片
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-4xl">
        <div className="rounded-xl border border-border bg-card p-2 shadow-sm focus-within:border-primary">
          {staged.length > 0 ? (
            <div className="flex flex-wrap gap-2 px-1 pb-2">
              {staged.map((image) => (
                <div
                  key={image.id}
                  className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border bg-muted"
                >
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    title={image.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    aria-label={`移除 ${image.name}`}
                    onClick={() =>
                      setStaged((previous) => previous.filter((item) => item.id !== image.id))
                    }
                    className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {selectedSkill ? (
            <div className="px-1 pb-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                <Wrench className="h-3 w-3" aria-hidden="true" />
                {selectedSkill.name}
                <button
                  type="button"
                  aria-label="取消技能"
                  onClick={() => setSelectedSkillId(null)}
                  className="ml-0.5 rounded-sm opacity-70 transition-opacity hover:opacity-100"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            </div>
          ) : null}

          <textarea
            rows={2}
            value={value}
            disabled={isRunning}
            onChange={(event) => onValueChange(event.target.value)}
            onPaste={(event) => {
              const files = Array.from(event.clipboardData.files)
              if (files.length > 0) {
                event.preventDefault()
                if (!isRunning) stageFiles(files)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSend()
              }
            }}
            className="max-h-40 min-h-[52px] w-full resize-none border-0 bg-transparent px-2 py-1.5 text-body outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            placeholder={isRunning ? 'Agent 执行中...' : placeholder}
            aria-label="分析输入框"
          />

          <div className="flex items-center gap-1 px-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                stageFiles(Array.from(event.target.files ?? []))
                event.target.value = ''
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="上传图片（最多 4 张，单张 10MB）"
              aria-label="上传图片"
              disabled={isRunning}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" aria-hidden="true" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  title="选择技能"
                  aria-label="选择技能"
                  disabled={isRunning}
                >
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  技能
                </DropdownMenuLabel>
                {capabilities.skills.map((skill) => (
                  <DropdownMenuItem
                    key={skill.id}
                    onSelect={() => setSelectedSkillId(skill.id)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="text-xs font-medium">{skill.name}</span>
                      {selectedSkillId === skill.id ? (
                        <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      ) : null}
                    </span>
                    <span className="text-[10px] leading-4 text-muted-foreground">
                      {skill.description}
                    </span>
                  </DropdownMenuItem>
                ))}
                {selectedSkillId ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setSelectedSkillId(null)}>
                      清除技能
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="切换模型"
                  aria-label="切换模型"
                  className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Cpu className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="max-w-[140px] truncate">{currentModelLabel}</span>
                  <ChevronDown className="h-3 w-3" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                  模型
                </DropdownMenuLabel>
                {capabilities.models.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    onSelect={() => onModelChange(option.id)}
                    className="flex items-start justify-between gap-2"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">{option.label}</span>
                      {option.description ? (
                        <span className="text-[10px] text-muted-foreground">
                          {option.description}
                        </span>
                      ) : null}
                    </span>
                    {activeModel === option.id ? (
                      <Check className="mt-0.5 h-3.5 w-3.5 text-primary" aria-hidden="true" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              type="button"
              size="icon"
              className="ml-auto h-8 w-8 rounded-full"
              title="发送"
              aria-label="发送"
              onClick={() => void handleSend()}
              disabled={isRunning || (!value.trim() && staged.length === 0)}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
        <p className="mt-1.5 text-center text-caption text-muted-foreground">
          Nova 可能会出错，请核对关键数字 · 写操作会先向你确认
        </p>
      </div>
    </div>
  )
}
