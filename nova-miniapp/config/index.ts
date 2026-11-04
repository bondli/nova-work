import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'path'

import devConfig from './dev'
import prodConfig from './prod'

// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'nova-miniapp',
    date: '2026-11-02',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: ['@tarojs/plugin-html'],
    copy: {
      // tabBar 图标需原样拷贝到产物目录，路径与 app.config.ts 中引用一致。
      // 注意：Taro 的 to 是相对「项目根目录」解析（不是 outputRoot），
      // 写 'assets' 会把文件拷到 nova-miniapp/assets，必须显式带上产物目录。
      patterns: [{ from: 'src/assets', to: 'dist/assets' }],
      options: {}
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        exclude: ['@nutui/nutui-react-taro', '@nutui/icons-react-taro']
      }
    },
    alias: {
      '@': path.resolve(__dirname, '..', 'src')
    },
    mini: {
      // 各页面引用组件样式的顺序不同，mini-css-extract-plugin 会报 chunk order 冲突；
      // 组件样式互不覆盖，忽略顺序即可，不影响产物与运行。
      miniCssExtractPluginOption: {
        ignoreOrder: true
      },
      // NutUI 组件样式内部仍是 @import 写法（Dart Sass 3.0 才移除），
      // 关闭该类弃用告警，避免每次构建刷屏；legacy-js-api 与 Taro 基础配置保持一致。
      sassLoaderOption: {
        sassOptions: {
          silenceDeprecations: ['import', 'legacy-js-api']
        }
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        url: {
          enable: true,
          config: {
            limit: 1024
          }
        }
      }
    }
  }

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig)
  }
  return merge({}, baseConfig, prodConfig)
})
