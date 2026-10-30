"use client"

import type { CSSProperties } from "react"
import { Loader2Icon } from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

type ToastTone = "success" | "warning" | "error" | "info"

/** antd message 的实心圆形状态图标配色 */
const TONE_COLOR: Record<ToastTone, string> = {
  success: "text-[#52c41a]",
  warning: "text-[#faad14]",
  error: "text-[#ff4d4f]",
  info: "text-[#1677ff]",
}

/** 实心圆底 + 白色字形，对齐 antd message 的图标样式 */
function AntdBadgeIcon({ tone }: { tone: ToastTone }) {
  return (
    <svg viewBox="0 0 20 20" className={`size-5 shrink-0 ${TONE_COLOR[tone]}`} aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      {tone === "success" ? (
        <path
          d="M5.7 10.4 8.6 13.3 14.3 7.5"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {tone === "error" ? (
        <path
          d="M7 7l6 6M13 7l-6 6"
          fill="none"
          stroke="#fff"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ) : null}
      {tone === "warning" ? (
        <>
          <path d="M10 5.6v5.6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          <circle cx="10" cy="14.2" r="1.15" fill="#fff" />
        </>
      ) : null}
      {tone === "info" ? (
        <>
          <circle cx="10" cy="6" r="1.15" fill="#fff" />
          <path d="M10 9.1v5.3" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : null}
    </svg>
  )
}

const Toaster = ({ theme = "system", ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <AntdBadgeIcon tone="success" />,
        warning: <AntdBadgeIcon tone="warning" />,
        error: <AntdBadgeIcon tone="error" />,
        info: <AntdBadgeIcon tone="info" />,
        loading: <Loader2Icon className="size-5 shrink-0 animate-spin text-primary" />,
      }}
      style={
        {
          // 与 antd message 一致：背景/文字跟随浅色与深色主题，卡片无边框
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "8px",
          // 容器给足宽度，单条 toast 自身使用 fit-content
          "--width": "min(90vw, 640px)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
