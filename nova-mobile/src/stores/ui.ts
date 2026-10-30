import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface UiState {
  profileOpen: boolean;
  scanOpen: boolean;
  toasts: ToastItem[];
  /** 顶栏扫码后回填到库存页的条码 */
  inventoryKeyword: string;
  /** 扫码后只回填条码（不回查商品/不加入买单）的回调，如换货页 */
  scanCodeHandler: ((code: string) => void) | null;

  openProfile: () => void;
  closeProfile: () => void;
  openScan: () => void;
  openScanForCode: (handler: (code: string) => void) => void;
  closeScan: () => void;
  showToast: (message: string, tone?: ToastTone) => void;
  clearToast: () => void;
  setInventoryKeyword: (keyword: string) => void;
}

let toastSeq = 0;
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();

/** 错误/警告停留更久，保证用户能看清提示 */
const TOAST_DURATION: Record<ToastTone, number> = {
  success: 2000,
  info: 2000,
  warning: 2800,
  error: 3200,
};

export const useUiStore = create<UiState>((set, get) => ({
  profileOpen: false,
  scanOpen: false,
  toasts: [],
  inventoryKeyword: '',
  scanCodeHandler: null,

  openProfile: () => set({ profileOpen: true }),
  closeProfile: () => set({ profileOpen: false }),
  openScan: () => set({ scanOpen: true, scanCodeHandler: null }),
  openScanForCode: (handler) => set({ scanOpen: true, scanCodeHandler: handler }),
  closeScan: () => set({ scanOpen: false, scanCodeHandler: null }),

  showToast: (message, tone = 'success') => {
    const text = message.trim();
    if (!text) return;
    const id = ++toastSeq;
    // 同时最多展示 3 条，新的在下；旧提示自动让位
    set({ toasts: [...get().toasts, { id, message: text, tone }].slice(-3) });
    const timer = setTimeout(() => {
      toastTimers.delete(id);
      set({ toasts: get().toasts.filter((item) => item.id !== id) });
    }, TOAST_DURATION[tone]);
    toastTimers.set(id, timer);
  },
  clearToast: () => {
    toastTimers.forEach((timer) => clearTimeout(timer));
    toastTimers.clear();
    set({ toasts: [] });
  },
  setInventoryKeyword: (inventoryKeyword) => set({ inventoryKeyword }),
}));
