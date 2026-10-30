import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge 默认只认识内置字号（text-sm / text-xs…），
 * 会把 globals.css 里自定义的 text-ui / text-meta 等误判为文字颜色，
 * 一旦后面再写 text-muted-foreground 就会把字号类删掉。
 * 这里把自定义语义字号注册进 font-size 分组，保证字号与颜色可以共存。
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['caption', 'meta', 'ui', 'body', 'message', 'title', 'metric', 'brand'] }
      ]
    }
  }
})

/** 合并 className：clsx 处理条件类名，tailwind-merge 消除冲突的 Tailwind 类 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
