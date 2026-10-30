/**
 * nova-pos-server HTTP 客户端。
 * 只做三件事：拼 URL / 带 JWT / 把错误翻译成可直接展示的中文。
 */
import { Platform } from 'react-native';

import { DEFAULT_BASE_URL } from './storage';
import { APP_VERSION } from './version';

export interface ApiState {
  baseUrl: string;
  token: string | null;
}

const state: ApiState = { baseUrl: DEFAULT_BASE_URL, token: null };
let onUnauthorized: (() => void) | null = null;

export function configureApi(next: Partial<ApiState>): void {
  if (next.baseUrl !== undefined) state.baseUrl = normalizeBaseUrl(next.baseUrl);
  if (next.token !== undefined) state.token = next.token;
}

export function getApiBaseUrl(): string {
  return state.baseUrl;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return DEFAULT_BASE_URL;
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type QueryValue = string | number | boolean | null | undefined;

/** 服务端操作日志需要记录客户端版本与操作系统，随每次请求上报 */
function clientHeaders(): Record<string, string> {
  const osName =
    Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  return {
    'x-client-os': `${osName} ${String(Platform.Version)}`,
    'x-client-version': APP_VERSION,
  };
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  body?: unknown;
  timeoutMs?: number;
}

function buildQuery(query: Record<string, QueryValue> | undefined): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, timeoutMs = 20000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${state.baseUrl}${path}${buildQuery(query)}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...clientHeaders(),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        payload = null;
      }
    }

    if (response.status === 401) {
      const message = extractMessage(payload);
      // 登录请求本身没有 token，此时 401 是账号密码错误，不应触发登出流程
      if (state.token) onUnauthorized?.();
      throw new ApiError(message ?? '登录已过期，请重新登录', 401);
    }

    if (!response.ok) {
      throw new ApiError(extractMessage(payload) ?? `请求失败（${response.status}）`, response.status);
    }

    if (payload && typeof payload === 'object' && 'error' in payload) {
      const error = (payload as { error?: unknown }).error;
      if (typeof error === 'string' && error) throw new ApiError(translate(error), 200);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查店内网络后重试');
    }
    throw new ApiError('无法连接服务器，请检查服务地址与网络');
  } finally {
    clearTimeout(timer);
  }
}

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as { message?: unknown; error?: unknown };
  if (typeof record.message === 'string' && record.message) return record.message;
  if (typeof record.error === 'string' && record.error) return translate(record.error);
  return null;
}

/** 老系统错误文案直接透出中文；英文枚举给出可执行提示 */
export function translate(message: string): string {
  const map: Record<string, string> = {
    'Order not found': '订单不存在或已删除',
    'Member not found': '会员不存在',
    'member had exists': '该手机号已是会员',
    'Inventory not found': '库存记录不存在',
    Unauthorized: '登录已过期，请重新登录',
    Forbidden: '当前账号没有该操作权限',
  };
  return map[message] ?? message;
}

export const apiGet = <T>(path: string, query?: Record<string, QueryValue>): Promise<T> =>
  request<T>(path, { query });

export const apiPost = <T>(path: string, body?: unknown, query?: Record<string, QueryValue>): Promise<T> =>
  request<T>(path, { method: 'POST', body, query });
