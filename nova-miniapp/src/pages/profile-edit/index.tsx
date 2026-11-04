import { useState } from 'react'
import { Text, View } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { Button, DatePicker, Input } from '@nutui/nutui-react-taro'
import { ArrowRight } from '@nutui/icons-react-taro'
import EmptyState from '@/components/EmptyState'
import { updateProfile } from '@/services/profile'
import { useUserStore } from '@/stores/user'
import { memberLevelLabel } from '@/utils/format'
import './index.scss'

const START_DATE = new Date(1950, 0, 1)
const pad = (value: number) => String(value).padStart(2, '0')

/** 会员生日为空时默认 1990-01-01，避免 DatePicker 无法初始化 */
function toDate(value: string | null | undefined): Date {
  if (!value) return new Date(1990, 0, 1)
  const parsed = new Date(value.replace(/-/g, '/'))
  return Number.isNaN(parsed.getTime()) ? new Date(1990, 0, 1) : parsed
}

export default function ProfileEditPage() {
  const token = useUserStore((state) => state.token)
  const member = useUserStore((state) => state.member)
  const refreshProfile = useUserStore((state) => state.refreshProfile)
  const [name, setName] = useState(member?.name ?? '')
  const [birthday, setBirthday] = useState(member?.birthday ?? '')
  const [pickerVisible, setPickerVisible] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!token || !member) {
    return (
      <View className='nb-page'>
        <View>
          <EmptyState title='请先登录' description='登录后可修改会员资料' actionText='去登录' onAction={() => Taro.switchTab({ url: '/pages/mine/index' })} />
        </View>
      </View>
    )
  }

  const handleConfirmBirthday = (selectedValue: Array<string | number | null>) => {
    const [year, month, day] = selectedValue
    if (year === null || month === null || day === null) return
    // Picker 返回 年/月/日 数字，统一补零成 YYYY-MM-DD
    setBirthday(`${Number(year)}-${pad(Number(month))}-${pad(Number(day))}`)
    setPickerVisible(false)
  }

  const handleSave = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      Taro.showToast({ title: '昵称不能为空', icon: 'none' })
      return
    }
    if (saving) return
    setSaving(true)
    try {
      await updateProfile({ name: trimmed, birthday: birthday || undefined })
      await refreshProfile()
      Taro.showToast({ title: '资料已更新', icon: 'success' })
      setTimeout(() => Taro.navigateBack(), 600)
    } catch (error) {
      Taro.showToast({ title: error instanceof Error ? error.message : '保存失败', icon: 'none' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className='nb-page nb-profile-edit'>
      <View className='nb-card nb-profile-card'>
        <Text className='nb-profile-edit-title'>修改会员资料</Text>
        <Text className='nb-profile-edit-sub'>昵称与生日可自助修改，手机号即会员号不可变更</Text>

        <View className='nb-profile-form'>
          <View className='nb-field-item'>
            <Text className='nb-field-label'>昵称</Text>
            <Input
              className='nb-field'
              value={name}
              maxLength={16}
              placeholder='请输入昵称'
              onChange={setName}
            />
          </View>

          <View className='nb-field-item'>
            <Text className='nb-field-label'>生日</Text>
            <View className='nb-field nb-field-trigger' onClick={() => setPickerVisible(true)}>
              <Text className={birthday ? 'nb-field-value' : 'nb-field-placeholder'}>
                {birthday || '请选择生日'}
              </Text>
              <ArrowRight size={14} color='#a1a1aa' />
            </View>
            <Text className='nb-field-hint'>生日当月到店可领会员生日礼</Text>
          </View>

          <View className='nb-field-item'>
            <Text className='nb-field-label'>手机号</Text>
            <Input className='nb-field nb-field-readonly' value={member.phone} readOnly />
          </View>

          <View className='nb-field-item'>
            <Text className='nb-field-label'>会员等级</Text>
            <Input className='nb-field nb-field-readonly' value={memberLevelLabel(member.level)} readOnly />
          </View>
        </View>

        <Button
          type='primary'
          block
          className='nb-profile-save'
          loading={saving}
          disabled={saving}
          onClick={handleSave}
        >
          保存修改
        </Button>
        <Text className='nb-profile-edit-note'>保存后立即生效，会员资产与积分不受影响</Text>
      </View>

      <DatePicker
        visible={pickerVisible}
        title='选择生日'
        type='date'
        startDate={START_DATE}
        endDate={new Date()}
        defaultValue={toDate(birthday)}
        onClose={() => setPickerVisible(false)}
        onCancel={() => setPickerVisible(false)}
        onConfirm={(_, selectedValue) => handleConfirmBirthday(selectedValue)}
      />
    </View>
  )
}
