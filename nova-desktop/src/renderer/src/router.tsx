import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@renderer/components/layout/AppShell'
import { AuthPage } from '@renderer/features/auth/AuthPage'
import { AnalysisPage } from '@renderer/pages/analysis/AnalysisPage'
import { BuyPage } from '@renderer/pages/buy/BuyPage'
import { DataPage } from '@renderer/pages/data/DataPage'
import { InventoryPage } from '@renderer/pages/inventory/InventoryPage'
import { MarketingPage } from '@renderer/pages/marketing/MarketingPage'
import { MembersPage } from '@renderer/pages/members/MembersPage'
import { OrdersPage } from '@renderer/pages/orders/OrdersPage'
import { useAuthStore } from '@renderer/stores/auth-store'
import { AppSplash } from './AppSplash'

/**
 * 路由与登录态守卫。
 * loading 显示启动页，anonymous 显示登录 / 注册页，已登录才渲染应用壳与业务路由。
 */
export function AppRoutes() {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  if (status === 'loading') return <AppSplash />
  if (status === 'anonymous') return <AuthPage />

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/analysis" replace />} />
        <Route path="analysis" element={<AnalysisPage />} />
        <Route path="buy" element={<BuyPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="data" element={<DataPage />} />
        <Route path="*" element={<Navigate to="/analysis" replace />} />
      </Route>
    </Routes>
  )
}
