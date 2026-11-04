import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button } from '@nutui/nutui-react-taro'
import { Check, Store } from '@nutui/icons-react-taro'
import BottomSheet from '@/components/BottomSheet'
import EmptyState from '@/components/EmptyState'
import MediaImage from '@/components/MediaImage'
import RedeemCard from '@/components/RedeemCard'
import { redeemItem } from '@/services/redeem'
import { useUserStore } from '@/stores/user'
import type { RedeemItem, RedeemOrder } from '@/types/api'
import { formatPoints } from '@/utils/format'
import { createRequestId } from '@/utils/wheel'
import './index.scss'

interface RedeemPanelProps {
  items: RedeemItem[]
  /** 当前可用积分，决定按钮可兑换状态 */
  points: number
  /** 兑换成功后回调，父级据此刷新积分与库存 */
  onRedeemed?: (points: number) => void
  onRefresh?: () => void
}

interface RedeemSuccess {
  order: RedeemOrder
  item: RedeemItem
}

/**
 * 积分兑换区块：礼品列表 + 确认弹层 + 成功取货码。
 * 发现页与独立兑换页共用，避免两处维护同一套兑换流程。
 */
export default function RedeemPanel({ items, points, onRedeemed, onRefresh }: RedeemPanelProps) {
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const [selected, setSelected] = useState<RedeemItem | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [success, setSuccess] = useState<RedeemSuccess | null>(null)

  const handleConfirm = async () => {
    if (!selected || confirming) return
    setConfirming(true)
    try {
      const result = await redeemItem(selected.id, createRequestId())
      setSuccess({ order: result.order, item: selected })
      setSelected(null)
      void refreshProfile()
      onRedeemed?.(result.points)
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '兑换失败', icon: 'none' })
    } finally {
      setConfirming(false)
    }
  }

  return (
    <View className='nb-redeem-panel'>
      {items.length ? (
        <View className='nb-redeem-list'>
          {items.map((item) => (
            <RedeemCard key={item.id} item={item} points={points} onRedeem={setSelected} />
          ))}
        </View>
      ) : (
        <View>
          <EmptyState title='暂无可兑换礼品' description='门店上新后会在这里展示' actionText='刷新' onAction={onRefresh} />
        </View>
      )}

      <BottomSheet
        visible={Boolean(selected)}
        title='确认兑换'
        desc='兑换后需到店自提，积分不可退回'
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <View className='nb-redeem-confirm'>
            <View className='nb-redeem-confirm-item'>
              <MediaImage src={selected.image} label='DAVE & BELLA' className='nb-redeem-confirm-img' />
              <View className='nb-redeem-confirm-info'>
                <Text className='nb-redeem-confirm-name'>{selected.name}</Text>
                <Text className='nb-redeem-confirm-desc'>{selected.description}</Text>
                <Text className='nb-redeem-confirm-points'>{formatPoints(selected.points)} 积分</Text>
              </View>
            </View>
            <View className='nb-redeem-summary'>
              <View className='nb-redeem-summary-row'>
                <Text>当前积分</Text>
                <Text>{formatPoints(points)}</Text>
              </View>
              <View className='nb-redeem-summary-row'>
                <Text>本次消耗</Text>
                <Text className='nb-redeem-summary-minus'>-{formatPoints(selected.points)}</Text>
              </View>
              <View className='nb-redeem-summary-row'>
                <Text>兑换后剩余</Text>
                <Text>{formatPoints(Math.max(0, points - selected.points))}</Text>
              </View>
            </View>
            <View className='nb-redeem-pickup'>
              <View className='nb-redeem-pickup-title'>
                <Store size={14} color='#c7001a' />
                <Text>取货说明</Text>
              </View>
              <Text>
                兑换成功后生成 6 位取货码，请于 30 天内到 Dave & Bella 世纪金源店 收银台出示核销，逾期作废且积分不退。
              </Text>
            </View>
            <View className='nb-redeem-confirm-actions'>
              <Button className='nb-redeem-cancel' onClick={() => setSelected(null)}>
                再想想
              </Button>
              <Button
                type='primary'
                className='nb-redeem-submit'
                loading={confirming}
                onClick={handleConfirm}
              >
                确认兑换
              </Button>
            </View>
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={Boolean(success)} onClose={() => setSuccess(null)} showClose={false}>
        {success ? (
          <View className='nb-redeem-success'>
            <View className='nb-redeem-success-icon'>
              <Check size={32} color='#ff0f23' />
            </View>
            <Text className='nb-redeem-success-title'>兑换成功</Text>
            <Text className='nb-redeem-success-desc'>
              {success.item.name} · 已扣 {formatPoints(success.item.points)} 积分
            </Text>
            <View className='nb-redeem-code'>
              <Text className='nb-redeem-code-label'>到店取货码</Text>
              <Text className='nb-redeem-code-digits'>{success.order.pickupCode}</Text>
              <Text className='nb-redeem-code-exp'>有效期 30 天 · 逾期作废</Text>
            </View>
            <Text className='nb-redeem-success-note'>
              请到 Dave & Bella 世纪金源店 收银台
              {'\n'}
              出示取货码，由店员核销后取货
            </Text>
            <View className='nb-redeem-success-actions'>
              <Button
                className='nb-redeem-cancel'
                onClick={() => {
                  setSuccess(null)
                  Taro.navigateTo({ url: '/pages/redeem-records/index' })
                }}
              >
                查看记录
              </Button>
              <Button type='primary' className='nb-redeem-submit' onClick={() => setSuccess(null)}>
                知道了
              </Button>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </View>
  )
}
