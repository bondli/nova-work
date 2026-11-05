import { useEffect, useRef, useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro, { useDidShow, useShareAppMessage } from '@tarojs/taro'
import { Button, Cell, CellGroup, Grid, GridItem } from '@nutui/nutui-react-taro'
import { ArrowRight, Coupon, Gift, LocationF, Message, Order, Received, Star, Tips, Wallet } from '@nutui/icons-react-taro'
import BottomSheet from '@/components/BottomSheet'
import LoginGuide from '@/components/LoginGuide'
import MemberCard from '@/components/MemberCard'
import MemberRights from '@/components/MemberRights'
import SectionHeader from '@/components/SectionHeader'
import StoreCard from '@/components/StoreCard'
import { FALLBACK_STORE } from '@/constants'
import { getOrders } from '@/services/order'
import { getStore } from '@/services/home'
import { useUserStore } from '@/stores/user'
import type { OrderRecord, StoreInfo } from '@/types/api'
import { formatDateTime, formatMoney, formatPayType, memberLevelLabel } from '@/utils/format'
import './index.scss'

const QUICK_ITEMS = [
  { label: '购物记录', icon: <Order size={20} color='#ff0f23' />, url: '/pages/orders/index' },
  { label: '积分流水', icon: <Star size={20} color='#ff0f23' />, url: '/pages/points/index' },
  { label: '抽奖记录', icon: <Gift size={20} color='#ff0f23' />, url: '/pages/draws/index' },
  { label: '优惠券', icon: <Coupon size={20} color='#ff0f23' />, url: '/pages/coupons/index' },
  { label: '余额查询', icon: <Wallet size={20} color='#ff0f23' />, url: '/pages/balance/index' },
  { label: '我的兑换', icon: <Received size={20} color='#ff0f23' />, url: '/pages/redeem-records/index' }
]

export default function MinePage() {
  const token = useUserStore((state) => state.token)
  const member = useUserStore((state) => state.member)
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const logout = useUserStore((state) => state.logout)
  const [recentOrder, setRecentOrder] = useState<OrderRecord | null>(null)
  const [store, setStore] = useState<StoreInfo>(FALLBACK_STORE)
  const [profileVisible, setProfileVisible] = useState(false)
  const [logoutVisible, setLogoutVisible] = useState(false)
  const [storeVisible, setStoreVisible] = useState(false)
  const [rightsVisible, setRightsVisible] = useState(false)
  const firstShow = useRef(true)

  // 开启右上角「···」面板的「转发给朋友」
  useShareAppMessage(() => ({
    title: 'Dave & Bella · 我的会员中心',
    path: '/pages/mine/index',
    imageUrl: store.image || undefined,
  }))

  const loadRecentOrder = async () => {
    try {
      const result = await getOrders(1, 1)
      setRecentOrder(result.list[0] ?? null)
    } catch {
      // 订单接口失败不影响个人中心其他模块
    }
  }

  const loadStore = async () => {
    try {
      const data = await getStore()
      setStore(data)
    } catch {
      setStore(FALLBACK_STORE)
    }
  }

  // 真实拨打门店电话；号码未配置或拨号失败时给出明确提示
  const callStore = () => {
    const phone = store.phone.replace(/\D/g, '')
    if (!phone) {
      Taro.showToast({ title: '门店暂未配置联系电话', icon: 'none' })
      return
    }
    Taro.makePhoneCall({
      phoneNumber: phone,
      fail: () => Taro.showToast({ title: `拨号失败，请手动拨打 ${phone}`, icon: 'none' })
    })
  }

  useEffect(() => {
    if (!token) return
    void refreshProfile().catch(() => undefined)
    void loadRecentOrder()
    void loadStore()
    // 登录态变化时重新拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useDidShow(() => {
    if (firstShow.current) {
      firstShow.current = false
      return
    }
    if (token) {
      void refreshProfile().catch(() => undefined)
      void loadRecentOrder()
    }
  })

  const handleQuick = (index: number) => {
    const target = QUICK_ITEMS[index]
    if (target) void Taro.navigateTo({ url: target.url })
  }

  const handleOrderDetail = () => {
    if (recentOrder) {
      Taro.navigateTo({ url: `/pages/order-detail/index?orderSn=${recentOrder.orderSn}` })
    }
  }

  const handleLogout = () => {
    logout()
    setLogoutVisible(false)
    Taro.showToast({ title: '已退出登录', icon: 'none' })
    void Taro.switchTab({ url: '/pages/home/index' })
  }

  if (!token || !member) {
    return <LoginGuide scene='mine' />
  }

  return (
    <View className='nb-page nb-mine'>
      <MemberCard
        member={member}
        onProfile={() => setProfileVisible(true)}
        onBalance={() => Taro.navigateTo({ url: '/pages/balance/index' })}
        onPoints={() => Taro.navigateTo({ url: '/pages/points/index' })}
        onCoupons={() => Taro.navigateTo({ url: '/pages/coupons/index' })}
        onRights={() => setRightsVisible(true)}
      />

      <View className='nb-card nb-quick-card'>
        {/* square 默认 true 会给每个格子加 padding-top = 格宽，把两行 icon 撑得很开，这里关掉 */}
        <Grid columns={3} gap={0} square={false} center={false} onClick={(_, index) => handleQuick(index)}>
          {QUICK_ITEMS.map((item) => (
            <GridItem
              key={item.label}
              text={
                <View className='nb-quick-item'>
                  <View className='nb-quick-icon'>{item.icon}</View>
                  <Text className='nb-quick-label'>{item.label}</Text>
                </View>
              }
            />
          ))}
        </Grid>
      </View>

      {/* 没有消费记录时不展示「最近一笔消费」整块 */}
      {recentOrder ? (
        <>
          <SectionHeader
            title='最近一笔消费'
            more='全部记录'
            onMore={() => Taro.navigateTo({ url: '/pages/orders/index' })}
          />
          <View className='nb-card nb-recent-order' onClick={handleOrderDetail}>
            <View className='nb-recent-order-head'>
              <Text className='nb-recent-order-sn'>{recentOrder.orderSn}</Text>
            </View>
            <View className='nb-recent-order-body'>
              <Text className='nb-recent-order-name'>{recentOrder.orderItems} 件商品</Text>
              <Text className='nb-recent-order-amount'>{formatMoney(recentOrder.orderActualAmount)}</Text>
            </View>
            <Text className='nb-recent-order-meta'>
              {formatDateTime(recentOrder.createdAt)} · {formatPayType(recentOrder.payType)}
            </Text>
          </View>
        </>
      ) : null}

      <CellGroup className='nb-mine-menu' divider>
        <Cell
          title={
            <View className='nb-menu-title'>
              <LocationF size={16} color='#ff0f23' />
              <Text>门店信息</Text>
            </View>
          }
          extra={
            <View className='nb-menu-extra'>
              <Text className='nb-menu-extra-text'>
                {store.address.split('·').slice(-2).join('·').trim() || '查看详情'}
              </Text>
              <View className='nb-menu-arrow'>
                <ArrowRight size={12} color='#a1a1aa' />
              </View>
            </View>
          }
          clickable
          onClick={() => setStoreVisible(true)}
        />
        <Cell
          title={
            <View className='nb-menu-title'>
              <Message size={16} color='#ff0f23' />
              <Text>联系门店</Text>
            </View>
          }
          extra={<ArrowRight size={12} color='#a1a1aa' />}
          clickable
          onClick={callStore}
        />
        <Cell
          title={
            <View className='nb-menu-title'>
              <Tips size={16} color='#ff0f23' />
              <Text>关于 Dave & Bella</Text>
            </View>
          }
          extra={
            <View className='nb-menu-extra'>
              <Text>v1.0.0</Text>
              <ArrowRight size={12} color='#a1a1aa' />
            </View>
          }
          clickable
          onClick={() => Taro.showModal({ title: 'Dave & Bella 会员小程序', content: '版本 v1.0.0', showCancel: false })}
        />
      </CellGroup>

      <Button block className='nb-logout-button' onClick={() => setLogoutVisible(true)}>
        退出登录
      </Button>
      <Text className='nb-mine-foot'>Dave & Bella · 把柔软穿进童年</Text>

      <BottomSheet
        visible={profileVisible}
        title='会员资料'
        desc='手机号为门店会员号，如需修改请联系门店'
        onClose={() => setProfileVisible(false)}
      >
        <View className='nb-profile-list'>
          <View className='nb-profile-row'>
            <Text className='nb-profile-label'>手机号</Text>
            <Text className='nb-profile-value'>{member.phone}</Text>
          </View>
          <View className='nb-profile-row'>
            <Text className='nb-profile-label'>昵称</Text>
            <Text className='nb-profile-value'>{member.name || '未设置'}</Text>
          </View>
          <View className='nb-profile-row'>
            <Text className='nb-profile-label'>生日</Text>
            <Text className='nb-profile-value'>{member.birthday || '未设置'}</Text>
          </View>
          <View className='nb-profile-row'>
            <Text className='nb-profile-label'>会员等级</Text>
            <Text className='nb-profile-value'>{memberLevelLabel(member.level)}</Text>
          </View>
        </View>
        <Text className='nb-profile-note'>生日当月可享会员生日礼；昵称与生日支持自助修改。</Text>
        <Button
          type='primary'
          block
          className='nb-profile-edit'
          onClick={() => {
            setProfileVisible(false)
            Taro.navigateTo({ url: '/pages/profile-edit/index' })
          }}
        >
          修改资料
        </Button>
      </BottomSheet>

      <BottomSheet visible={logoutVisible} title='退出登录' onClose={() => setLogoutVisible(false)}>
        <Text className='nb-logout-desc'>退出后将清除本地会员登录态，再次使用需重新微信授权手机号。</Text>
        <View className='nb-logout-actions'>
          <Button className='nb-logout-cancel' onClick={() => setLogoutVisible(false)}>
            取消
          </Button>
          <Button className='nb-logout-confirm' onClick={handleLogout}>
            确认退出
          </Button>
        </View>
      </BottomSheet>

      <BottomSheet visible={storeVisible} title='门店信息' onClose={() => setStoreVisible(false)}>
        <StoreCard store={store} />
      </BottomSheet>

      <BottomSheet
        visible={rightsVisible}
        title='会员权益'
        desc='门店会员专属权益'
        onClose={() => setRightsVisible(false)}
      >
        <MemberRights />
      </BottomSheet>
    </View>
  )
}
