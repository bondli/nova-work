/** 会话与少量偏好存储：Expo SecureStore（Android Keystore 加密） */
import * as SecureStore from 'expo-secure-store';

import type { SessionUser } from './types';

const KEYS = {
  baseUrl: 'nova.baseUrl',
  token: 'nova.token',
  user: 'nova.user',
} as const;

export const DEFAULT_BASE_URL = 'http://127.0.0.1:9577';

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // 存储失败不阻断业务，本次运行仍使用内存态
  }
}

async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // 忽略
  }
}

export interface StoredSession {
  baseUrl: string;
  token: string;
  user: SessionUser;
}

export async function loadSession(): Promise<Partial<StoredSession>> {
  const [baseUrl, token, user] = await Promise.all([
    read(KEYS.baseUrl),
    read(KEYS.token),
    read(KEYS.user),
  ]);

  let parsedUser: SessionUser | null = null;
  if (user) {
    try {
      parsedUser = JSON.parse(user) as SessionUser;
    } catch {
      parsedUser = null;
    }
  }

  return {
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
    token: token ?? undefined,
    user: parsedUser ?? undefined,
  };
}

export async function saveSession(session: StoredSession): Promise<void> {
  await Promise.all([
    write(KEYS.baseUrl, session.baseUrl),
    write(KEYS.token, session.token),
    write(KEYS.user, JSON.stringify(session.user)),
  ]);
}

export async function saveBaseUrl(baseUrl: string): Promise<void> {
  await write(KEYS.baseUrl, baseUrl);
}

export async function clearSession(): Promise<void> {
  await Promise.all([remove(KEYS.token), remove(KEYS.user)]);
}
