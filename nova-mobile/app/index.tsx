import { Redirect } from 'expo-router';

import { useAuthStore } from '@/src/stores/auth';

/** 入口：已登录进订单列表（默认首页），未登录去登录页 */
export default function Index() {
  const token = useAuthStore((state) => state.token);
  return <Redirect href={token ? '/(tabs)/orders' : '/login'} />;
}
