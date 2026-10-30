import * as SQLite from 'expo-sqlite';

export type ThemePreference = 'system' | 'light' | 'dark';
export type FontSizePreference = 12 | 14 | 16;

export interface AppPreferences {
  theme: ThemePreference;
  fontSize: FontSizePreference;
}

const DEFAULT_PREFERENCES: AppPreferences = { theme: 'system', fontSize: 14 };
const DB_NAME = 'nova-settings.db';

let database: SQLite.SQLiteDatabase | null = null;

function getDatabase(): SQLite.SQLiteDatabase | null {
  if (database) return database;
  try {
    const db = SQLite.openDatabaseSync(DB_NAME);
    db.execSync(
      'CREATE TABLE IF NOT EXISTS preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
    );
    database = db;
    return database;
  } catch {
    return null;
  }
}

function parseRows(rows: { key: string; value: string }[]): AppPreferences {
  const preferences: AppPreferences = { ...DEFAULT_PREFERENCES };
  for (const row of rows) {
    if (row.key === 'theme' && (row.value === 'system' || row.value === 'light' || row.value === 'dark')) {
      preferences.theme = row.value;
    }
    if (row.key === 'fontSize') {
      const size = Number(row.value);
      if (size === 12 || size === 14 || size === 16) preferences.fontSize = size;
    }
  }
  return preferences;
}

/** 模块加载时同步读取一次，供主题 token 直接使用 */
export const appPreferences: AppPreferences = (() => {
  const db = getDatabase();
  if (!db) return { ...DEFAULT_PREFERENCES };
  try {
    const rows = db.getAllSync<{ key: string; value: string }>(
      'SELECT key, value FROM preferences',
    );
    return parseRows(rows);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
})();

/**
 * 写入偏好并同步更新内存副本。
 * 调用方在保存后重载 JS bundle，主题与字号即按新偏好重新生成。
 */
export function savePreferences(next: Partial<AppPreferences>): AppPreferences {
  Object.assign(appPreferences, next);
  const db = getDatabase();
  if (!db) return { ...appPreferences };
  try {
    for (const [key, value] of Object.entries(next)) {
      db.runSync(
        'INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)',
        key,
        String(value),
      );
    }
  } catch {
    // 落盘失败时仍保留内存中的偏好，重载后在本次会话内依然生效
  }
  return { ...appPreferences };
}
