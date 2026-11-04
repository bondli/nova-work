import { useCallback } from 'react'
import { Text, View } from '@tarojs/components'
import { useReachBottom } from '@tarojs/taro'
import { Image, Cell, CellGroup } from '@nutui/nutui-react-taro'
import { Gift } from '@nutui/icons-react-taro'
import sadFaceIcon from '@/assets/sad-face.svg'
import EmptyState from '@/components/EmptyState'
import { usePagedList } from '@/hooks/usePagedList'
import { getDrawRecords } from '@/services/records'
import type { DrawRecord, DrawRecordExtra } from '@/types/api'
import { formatDateTime } from '@/utils/format'
import './index.scss'

/** 列表接口已把 extra 解析成对象，这里兜底处理 JSON 字符串或异常值 */
function readExtra(record: DrawRecord): DrawRecordExtra {
  if (!record.extra || typeof record.extra === 'string') {
    if (typeof record.extra === 'string') {
      try {
        return JSON.parse(record.extra) as DrawRecordExtra
      } catch {
        return {}
      }
    }
    return {}
  }
  return record.extra
}

export default function DrawsPage() {
  const fetcher = useCallback((current: number, pageSize: number) => getDrawRecords(current, pageSize), [])
  const { list, loading, error, hasMore, loadMore, reload } = usePagedList<DrawRecord>(fetcher, [])

  useReachBottom(() => {
    if (hasMore) loadMore()
  })

  return (
    <View className='nb-page nb-draws-page'>
      <Text className='nb-draws-sub'>记录你的每一次好运</Text>

      {loading && !list.length ? (
        <View className='nb-draws-loading'>
          <EmptyState title='加载中' description='正在同步抽奖记录' />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='抽奖记录加载失败' description={error} actionText='重新加载' onAction={reload} />
        </View>
      ) : list.length ? (
        <CellGroup className='nb-draws-list' divider>
          {list.map((record) => {
            const extra = readExtra(record)
            const win = (extra.prizeType ?? (record.award === '谢谢参与' ? 'none' : 'points')) !== 'none'
            return (
              <Cell
                key={record.id}
                title={
                  <View className='nb-draws-item'>
                    <View className={`nb-draws-icon ${win ? 'nb-draws-icon-win' : ''}`}>
                      {win ? <Gift size={16} color='#ff0f23' /> : <Image src={sadFaceIcon} width={16} height={16} fit='contain' />}
                    </View>
                    <View className='nb-draws-info'>
                      <Text className='nb-draws-name'>{record.award || '谢谢参与'}</Text>
                      <Text className='nb-draws-time'>{formatDateTime(record.createdAt)}</Text>
                    </View>
                  </View>
                }
                extra={<Text className='nb-draws-cost'>-{extra.cost ?? 10} 积分</Text>}
              />
            )
          })}
          {hasMore ? <Text className='nb-list-tip'>上拉加载更多</Text> : <Text className='nb-list-tip'>已加载全部记录</Text>}
        </CellGroup>
      ) : (
        <View>
          <EmptyState title='暂无抽奖记录' description='参与积分抽奖后会展示在这里' />
        </View>
      )}
    </View>
  )
}
