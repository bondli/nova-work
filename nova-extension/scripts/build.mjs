/**
 * nova-extension 构建脚本
 * - Tailwind CLI 生成 dist/tailwind.css（popup 直接 link 引用）
 * - esbuild 打包 background（ESM）/ content（IIFE）/ popup（IIFE，React）
 * - 浮层样式以文本形式内联进 content.js，注入 Shadow DOM
 *
 * 用法：
 *   node scripts/build.mjs          构建一次
 *   node scripts/build.mjs --watch  监听（esbuild + tailwind 增量）
 */
import { build, context } from "esbuild"
import { execFileSync, spawn } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import autoprefixer from "autoprefixer"
import postcss from "postcss"
import tailwindcss from "tailwindcss"

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")
const DIST = join(ROOT, "dist")
const WATCH = process.argv.includes("--watch")

const require = createRequire(import.meta.url)
const tailwindConfig = require(join(ROOT, "tailwind.config.cjs"))

/** 静态资源：manifest、图标、页面骨架 */
const STATIC_FILES = ["manifest.json", "icons", "src/popup/popup.html"]

const ENTRIES = [
  { in: "src/background.ts", out: "background.js", format: "esm" },
  { in: "src/content/index.ts", out: "content.js", format: "iife" },
  { in: "src/popup/main.tsx", out: "popup.js", format: "iife" },
]

/** 把 .css 当文本导入：先过 Tailwind，再以字符串内联进 JS（供 Shadow DOM 使用） */
const cssTextPlugin = {
  name: "css-text",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({
      path: resolve(args.resolveDir ?? ROOT, args.path),
      namespace: "css-text",
    }))
    build.onLoad({ filter: /.*/, namespace: "css-text" }, async (args) => {
      const result = await postcss([tailwindcss(tailwindConfig), autoprefixer]).process(
        // 注意：路径是上一轮 onResolve 里解析出的绝对路径
        readFileSync(args.path, "utf8"),
        { from: args.path },
      )
      return { contents: `export default ${JSON.stringify(result.css)}`, loader: "js" }
    })
  },
}

const TAILWIND_CLI = join(ROOT, "node_modules", ".bin", "tailwindcss")
const TAILWIND_ARGS = [
  "-i",
  join(ROOT, "src/styles/tailwind.css"),
  "-o",
  join(DIST, "tailwind.css"),
]

function buildTailwind() {
  if (!WATCH) {
    execFileSync(TAILWIND_CLI, TAILWIND_ARGS, { stdio: "inherit" })
    return
  }
  const child = spawn(TAILWIND_CLI, [...TAILWIND_ARGS, "--watch"], { stdio: "inherit" })
  child.unref()
}

function copyStatic() {
  for (const file of STATIC_FILES) {
    const src = join(ROOT, file)
    if (!existsSync(src)) continue
    // src/popup/popup.html → dist/popup.html
    const dest = join(DIST, file.startsWith("src/") ? file.split("/").pop() : file)
    cpSync(src, dest, { recursive: true })
  }
}

const common = {
  bundle: true,
  platform: "browser",
  target: ["chrome110"],
  logLevel: "info",
  sourcemap: WATCH ? "inline" : false,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [cssTextPlugin],
}

async function run() {
  if (existsSync(DIST)) rmSync(DIST, { recursive: true, force: true })
  mkdirSync(DIST, { recursive: true })

  buildTailwind()
  copyStatic()

  // popup 用 link 引用编译产物，构建前确保文件存在（watch 首帧）
  if (WATCH && !existsSync(join(DIST, "tailwind.css"))) {
    execFileSync(TAILWIND_CLI, TAILWIND_ARGS, { stdio: "inherit" })
  }

  const options = (entry) => ({
    ...common,
    entryPoints: [join(ROOT, entry.in)],
    outfile: join(DIST, entry.out),
    format: entry.format,
  })

  if (WATCH) {
    const contexts = await Promise.all(ENTRIES.map((entry) => context(options(entry))))
    await Promise.all(contexts.map((ctx) => ctx.watch()))
    console.log("[build] watching for changes…")
    return
  }

  await Promise.all(ENTRIES.map((entry) => build(options(entry))))
  console.log(`[build] done → ${DIST}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
