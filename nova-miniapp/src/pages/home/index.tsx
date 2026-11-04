import { useState } from 'react'
import { ScrollView, Text, View } from '@tarojs/components'
import Taro, { useLoad } from '@tarojs/taro'
import { Button, Skeleton } from '@nutui/nutui-react-taro'
import { Heart } from '@nutui/icons-react-taro'
import AuthButton from '@/components/AuthButton'
import BannerRail from '@/components/BannerRail'
import BrandStoryCard from '@/components/BrandStoryCard'
import CategoryGrid from '@/components/CategoryGrid'
import EmptyState from '@/components/EmptyState'
import MemberRights from '@/components/MemberRights'
import ProductCard from '@/components/ProductCard'
import SectionHeader from '@/components/SectionHeader'
import StoreCard from '@/components/StoreCard'
import { FALLBACK_STORE } from '@/constants'
import { getHome } from '@/services/home'
import { useUserStore } from '@/stores/user'
import type { HomeBanner, HomeData, HomeProduct } from '@/types/api'
import './index.scss'

export default function HomePage() {
  const token = useUserStore((state) => state.token)
  const [home, setHome] = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const homeData = await getHome()
      setHome(homeData)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  useLoad(() => {
    void load()
  })

  const handleBanner = (banner: HomeBanner) => {
    if (banner.link) {
      const isTab = ['/pages/home/index', '/pages/discover/index', '/pages/mine/index'].includes(banner.link)
      if (isTab) {
        void Taro.switchTab({ url: banner.link })
      } else {
        void Taro.navigateTo({ url: banner.link })
      }
      return
    }
    Taro.showToast({ title: '活动详情请关注门店公告', icon: 'none' })
  }

  const handleProduct = (product: HomeProduct) => {
    const detail = home?.productDetail
    if (!detail?.enabled) return
    if (!product.sn) {
      Taro.showToast({ title: '该商品暂未关联款式', icon: 'none' })
      return
    }
    const base = detail.path || '/pages/product/index'
    const sep = base.includes('?') ? '&' : '?'
    void Taro.navigateTo({ url: `${base}${sep}sn=${encodeURIComponent(product.sn)}` })
  }

  const handleMemberAction = () => {
    if (token) {
      void Taro.switchTab({ url: '/pages/mine/index' })
    }
  }

  const brandName = home?.brand.name || 'Dave & Bella'
  const brandSublabel = home?.brand.sublabel || 'DAVE & BELLA · KIDS 0-14'
  const store = home?.store || FALLBACK_STORE

  return (
    <View className='nb-page nb-home'>
      <View className='nb-brand-top'>
        <View>
          <Text className='nb-brand-logo nb-brand-mark'>{brandName}</Text>
          <Text className='nb-brand-tagline'>{brandSublabel}</Text>
        </View>
        <Text className='nb-brand-focus'>专注 0-14 岁儿童服饰</Text>
      </View>

      {loading ? (
        <View className='nb-card nb-home-skeleton'>
          <Skeleton rows={8} animated />
        </View>
      ) : error ? (
        <View>
          <EmptyState title='首页加载失败' description={error} actionText='重新加载' onAction={load} />
        </View>
      ) : home ? (
        <>
          <BannerRail banners={home.banners} onPress={handleBanner} />

          <SectionHeader title='主营类目' />
          <CategoryGrid categories={home.categories} />

          <SectionHeader title='品牌价值' />
          <BrandStoryCard story={home.brandStory} />

          <SectionHeader title='本季新品' />
          <ScrollView scrollX className='nb-product-rail' enhanced showScrollbar={false}>
            {home.products.map((product, index) => (
              <View key={`${product.name}-${index}`} className='nb-product-cell'>
                <ProductCard
                  product={product}
                  onClick={home?.productDetail?.enabled ? () => handleProduct(product) : undefined}
                />
              </View>
            ))}
          </ScrollView>

          <SectionHeader title='会员权益' />
          <MemberRights />

          <SectionHeader title='到店体验' />
          <StoreCard store={store} />

          <View className='nb-member-strip'>
            <View className='nb-member-strip-head'>
              <Heart size={16} color='#c7001a' />
              <Text className='nb-member-strip-title'>会员专属</Text>
            </View>
            <Text className='nb-member-strip-desc'>
              微信授权手机号即可查看会员资产、购物记录与优惠券，签到攒积分还能兑换实物到店自提。手机号就是你的门店会员号，无需重复注册。
            </Text>
            {token ? (
              <Button type='primary' block className='nb-member-strip-button' onClick={handleMemberAction}>
                进入会员中心
              </Button>
            ) : (
              <AuthButton text='微信授权手机号，解锁会员权益' />
            )}
          </View>

          <Text className='nb-home-foot'>Dave & Bella · 把柔软穿进童年</Text>
        </>
      ) : null}
    </View>
  )
}
