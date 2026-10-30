/**
 * 门店 POS 走的是局域网明文 HTTP（如 http://192.168.x.x:9577），
 * Android 9+ 默认禁止明文流量，这里在 application 上开启 usesCleartextTraffic。
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
