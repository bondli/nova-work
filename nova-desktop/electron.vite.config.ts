import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = {
  '@main': resolve(__dirname, 'src/main'),
  '@preload': resolve(__dirname, 'src/preload'),
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer/src')
}

/**
 * 生成构建期版本号，格式 `1.0.0.20261026`，开发环境为 `1.0.0.dev.20261026`。
 * 与 nova 项目的做法一致：版本号在构建时注入渲染层，运行时不需要再通过 IPC 查询。
 */
function resolveBuildVersion(isDevelopment: boolean): string {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
    version?: string
  }
  const baseVersion = pkg.version ?? '0.0.0'
  const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${baseVersion}${isDevelopment ? '.dev' : ''}.${buildDate}`
}

export default defineConfig(({ command }) => {
  const appVersion = resolveBuildVersion(command === 'serve')

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      resolve: { alias },
      // 主进程请求需要带上客户端版本，与服务端操作日志口径保持一致
      define: {
        __APP_VERSION__: JSON.stringify(appVersion)
      },
      build: {
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/main/index.ts') }
        }
      }
    },
    preload: {
      resolve: { alias },
      build: {
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/preload/index.ts') },
          output: { format: 'cjs', entryFileNames: 'index.cjs' }
        }
      }
    },
    renderer: {
      resolve: { alias },
      plugins: [react(), tailwindcss()],
      // 把版本号编译进代码，避免渲染层为了显示版本号额外请求主进程
      define: {
        __APP_VERSION__: JSON.stringify(appVersion)
      },
      build: {
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/renderer/index.html') }
        }
      }
    }
  }
})
