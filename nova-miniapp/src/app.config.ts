export default {
  pages: [
    'pages/index/index',
    'pages/discover/index',
    'pages/mine/index',
    'pages/orders/index',
    'pages/order-detail/index',
    'pages/activity-detail/index',
    'pages/product/index',
    'pages/points/index',
    'pages/draws/index',
    'pages/coupons/index',
    'pages/balance/index',
    'pages/redeem/index',
    'pages/redeem-records/index',
    'pages/draw/index',
    'pages/profile-edit/index'
  ],
  // 开启组件按需注入：只注入页面实际用到的自定义组件，减小启动时的代码注入量
  lazyCodeLoading: 'requiredComponents',
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTitleText: 'Dave & Bella',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f4f4f5'
  },
  tabBar: {
    color: '#a1a1aa',
    selectedColor: '#ff0f23',
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    list: [
      {
        pagePath: 'pages/index/index',
        text: '首页',
        iconPath: 'assets/tab/home-normal.png',
        selectedIconPath: 'assets/tab/home-active.png'
      },
      {
        pagePath: 'pages/discover/index',
        text: '发现',
        iconPath: 'assets/tab/compass-normal.png',
        selectedIconPath: 'assets/tab/compass-active.png'
      },
      {
        pagePath: 'pages/mine/index',
        text: '我的',
        iconPath: 'assets/tab/user-round-normal.png',
        selectedIconPath: 'assets/tab/user-round-active.png'
      }
    ]
  }
}
