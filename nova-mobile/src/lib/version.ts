import Constants from 'expo-constants';

/** 版本号由 app.config.ts 在打包时注入，规则与桌面端一致（1.0.0[.dev].YYYYMMDD） */
export const APP_VERSION: string =
  (Constants.expoConfig?.extra?.appVersion as string | undefined) ??
  Constants.expoConfig?.version ??
  '1.0.0';
