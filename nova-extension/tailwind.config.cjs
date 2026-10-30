/**
 * Tailwind 配置：语义色全部指向 CSS 变量（见 src/styles/tailwind.css），
 * 变量同时定义在 :root 与 :host，保证 popup 与 Shadow DOM 浮层都能取到。
 */
const path = require("node:path")

/** @type {import('tailwindcss').Config} */
module.exports = {
  // 用绝对路径，Tailwind CLI 与 esbuild 内的 postcss 都能正确扫描
  content: [path.join(__dirname, "src/**/*.{ts,tsx,html}")],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: "hsl(var(--destructive))",
        success: "hsl(var(--success))",
      },
      fontFamily: {
        sans: ["-apple-system", "PingFang SC", "Segoe UI", "sans-serif"],
        mono: ["SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
}
