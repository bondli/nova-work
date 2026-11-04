/** 登录态存储键：token 与会员缓存分开存，退出登录时一起清理 */
export const TOKEN_KEY = 'nova_token'
export const MEMBER_KEY = 'nova_member'

/** 401 后广播事件，页面监听后切换为登录引导 */
export const UNAUTHORIZED_EVENT = 'nova:unauthorized'

/** 开发态：本地 mall 服务（nova-mall-server） */
const API_BASE_URL_DEV = 'http://127.0.0.1:9566'
/** 生产态：云服务器域名，部署前替换成真实域名 */
const API_BASE_URL_PROD = 'https://davebella.top/mall2'

/** 按构建模式（taro build 为 production，dev 为 development）自动切换接口地址 */
export const API_BASE_URL =
  process.env.NODE_ENV === 'production' ? API_BASE_URL_PROD : API_BASE_URL_DEV

/** 门店页兜底配置：接口不可用时仍能展示门店信息 */
export const FALLBACK_STORE = {
  name: 'Dave & Bella 世纪金源店',
  address: '宁波市 · 杭州湾 · 世纪金源购物中心A区3楼',
  phone: '17757058183',
  hours: '10:00 - 21:30 · 周一至周日',
  lat: 30.328657,
  lng: 121.231143,
  image: ''
}

/** 签到奖励兜底值，与服务端配置默认值一致 */
export const DEFAULT_SIGN_REWARDS = [5, 5, 5, 10, 10, 10, 30]
