import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * 版本号生成规则与桌面端一致：`基础版本.构建日期`，开发环境额外带 `.dev` 标识。
 * 打包时写入 extra.appVersion，运行时通过 Constants 读取，不再依赖手改 app.json。
 */
function resolveBuildVersion(baseVersion: string, isDevelopment: boolean): string {
  const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${baseVersion}${isDevelopment ? '.dev' : ''}.${buildDate}`;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseVersion = config.version ?? '1.0.0';
  const isDevelopment = process.env.NODE_ENV !== 'production';

  return {
    ...config,
    name: config.name ?? 'DaveBella',
    slug: config.slug ?? 'davebella',
    extra: {
      ...config.extra,
      appVersion: resolveBuildVersion(baseVersion, isDevelopment),
    },
  };
};
