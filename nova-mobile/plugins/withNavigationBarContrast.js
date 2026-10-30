/**
 * Android 15+ 在透明导航栏上默认开启对比度遮罩（light 主题下是一条接近白色的带），
 * 会让页面底色在底部安全区断掉。这里关闭导航栏对比度强制，保持页面底色贯穿到底。
 */
const { withAndroidStyles } = require('expo/config-plugins');

module.exports = function withNavigationBarContrast(config) {
  return withAndroidStyles(config, (cfg) => {
    const appTheme = (cfg.modResults.resources.style ?? []).find(
      (style) => style.$ && style.$['name'] === 'AppTheme',
    );
    if (!appTheme) return cfg;

    appTheme.item = appTheme.item ?? [];
    const setItem = (name, value) => {
      const item = appTheme.item.find((entry) => entry.$ && entry.$['name'] === name);
      if (item) {
        item._ = value;
      } else {
        appTheme.item.push({ $: { name }, _: value });
      }
    };

    setItem('android:enforceNavigationBarContrast', 'false');
    setItem('android:enforceStatusBarContrast', 'false');
    return cfg;
  });
};
