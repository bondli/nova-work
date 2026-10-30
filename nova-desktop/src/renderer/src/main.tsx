/** 渲染层入口：挂载 React 根节点并加载全局样式 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './globals.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root container not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)
