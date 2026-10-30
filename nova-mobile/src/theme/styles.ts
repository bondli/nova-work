import { getThemeRevision } from './tokens';

/**
 * 模块级样式表：按主题版本懒重建。
 * 主题/字号切换后读取到的是按新 token 生成的新样式，组件重渲染即生效。
 */
export function themedStyles<T extends object>(create: () => T): T {
  let cachedRevision = -1;
  let cached: T | null = null;

  function resolve(): T {
    const revision = getThemeRevision();
    if (!cached || revision !== cachedRevision) {
      cached = create();
      cachedRevision = revision;
    }
    return cached;
  }

  // 完整代理为一个普通样式对象，供 StyleSheet.flatten / 展开等内部逻辑正常枚举
  return new Proxy({} as T, {
    get: (_target, key) => Reflect.get(resolve(), key),
    has: (_target, key) => Reflect.has(resolve(), key),
    ownKeys: () => Reflect.ownKeys(resolve()),
    getOwnPropertyDescriptor: (_target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(resolve(), key);
      return descriptor ? { ...descriptor, configurable: true } : undefined;
    },
  });
}
