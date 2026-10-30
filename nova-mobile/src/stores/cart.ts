import { create } from 'zustand';

import { calculatePricing } from '@/src/lib/pricing';
import type {
  BuyCoupon,
  BuyMember,
  CartItem,
  Clerk,
  InventoryRow,
  PaymentMethod,
  PaymentReceipt,
  PricingResult,
} from '@/src/lib/types';
import { toCents } from '@/src/lib/money';

interface CartState {
  items: CartItem[];
  member: BuyMember | null;
  clerk: Clerk | null;
  note: string;
  payment: PaymentMethod;
  received: string;
  usePoints: boolean;
  useBalance: boolean;
  memberCouponId: string | null;
  storeCoupons: BuyCoupon[];
  storeCouponId: string | null;
  lastReceipt: PaymentReceipt | null;

  addProduct: (row: InventoryRow) => void;
  setQty: (sku: string, qty: number) => void;
  setDiscount: (sku: string, discount: number) => void;
  removeItem: (sku: string) => void;
  setMember: (member: BuyMember | null) => void;
  setClerk: (clerk: Clerk | null) => void;
  setNote: (note: string) => void;
  setPayment: (payment: PaymentMethod) => void;
  setReceived: (received: string) => void;
  togglePoints: () => void;
  toggleBalance: () => void;
  selectMemberCoupon: (id: string | null) => void;
  setStoreCoupons: (coupons: BuyCoupon[]) => void;
  selectStoreCoupon: (id: string | null) => void;
  setReceipt: (receipt: PaymentReceipt | null) => void;
  clear: () => void;
}

const emptyState = {
  items: [] as CartItem[],
  member: null,
  clerk: null,
  note: '',
  payment: 'wechat' as PaymentMethod,
  received: '',
  usePoints: false,
  useBalance: false,
  memberCouponId: null,
  storeCoupons: [] as BuyCoupon[],
  storeCouponId: null,
  lastReceipt: null,
};

export const useCartStore = create<CartState>((set, get) => ({
  ...emptyState,

  addProduct: (row) => {
    const sku = row.sku;
    const existing = get().items.find((item) => item.sku === sku);
    if (existing) {
      set({ items: get().items.map((item) => (item.sku === sku ? { ...item, qty: item.qty + 1 } : item)) });
      return;
    }
    set({
      items: [
        ...get().items,
        {
          id: sku,
          sku,
          styleNo: row.sn,
          name: row.name,
          color: row.color ?? '',
          size: row.size ?? '',
          priceCents: toCents(row.originalPrice),
          qty: 1,
          discount: 6,
        },
      ],
    });
  },

  setQty: (sku, qty) =>
    set({
      items:
        qty <= 0
          ? get().items.filter((item) => item.sku !== sku)
          : get().items.map((item) => (item.sku === sku ? { ...item, qty } : item)),
    }),

  setDiscount: (sku, discount) =>
    set({
      items: get().items.map((item) =>
        item.sku === sku ? { ...item, discount: Math.min(10, Math.max(1, discount)) } : item,
      ),
    }),

  removeItem: (sku) => set({ items: get().items.filter((item) => item.sku !== sku) }),
  setMember: (member) =>
    set({
      member,
      usePoints: false,
      useBalance: false,
      memberCouponId: null,
    }),
  setClerk: (clerk) => set({ clerk }),
  setNote: (note) => set({ note }),
  setPayment: (payment) => set({ payment }),
  setReceived: (received) => set({ received }),
  togglePoints: () => set({ usePoints: !get().usePoints }),
  toggleBalance: () => set({ useBalance: !get().useBalance }),
  selectMemberCoupon: (id) => set({ memberCouponId: id }),
  setStoreCoupons: (coupons) =>
    set({
      storeCoupons: coupons,
      storeCouponId: coupons.some((coupon) => coupon.id === get().storeCouponId)
        ? get().storeCouponId
        : null,
    }),
  selectStoreCoupon: (id) => set({ storeCouponId: id }),
  setReceipt: (receipt) => set({ lastReceipt: receipt }),

  /** 收款成功后清空清单，但保留最近一次回执供成功页展示 */
  clear: () => set({ ...emptyState, lastReceipt: get().lastReceipt }),
}));

/** 当前清单的收款计算结果，供买单页与支付页共用 */
export function useCartPricing(): PricingResult {
  const items = useCartStore((state) => state.items);
  const member = useCartStore((state) => state.member);
  const memberCouponId = useCartStore((state) => state.memberCouponId);
  const storeCoupons = useCartStore((state) => state.storeCoupons);
  const storeCouponId = useCartStore((state) => state.storeCouponId);
  const usePoints = useCartStore((state) => state.usePoints);
  const useBalance = useCartStore((state) => state.useBalance);

  return calculatePricing(items, {
    member,
    coupon: member?.coupons.find((coupon) => coupon.id === memberCouponId) ?? null,
    storeCoupon: storeCoupons.find((coupon) => coupon.id === storeCouponId) ?? null,
    usePoints,
    useBalance,
  });
}
