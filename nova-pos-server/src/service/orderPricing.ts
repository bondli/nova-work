import Decimal from 'decimal.js';

import { DEFAULT_DISCOUNT } from '../router/constant';

type RawOrderItem = {
  id?: number | string;
  orderSn?: string;
  sku?: string;
  sn?: string;
  name?: string;
  brand?: string;
  color?: string;
  size?: string;
  originalPrice?: Decimal.Value;
  actualPrice?: Decimal.Value;
  counts?: Decimal.Value;
  isGived?: boolean;
  extra?: unknown;
};

type CalculateOrderItemPricesInput = {
  items: RawOrderItem[];
  orderActualAmount: Decimal.Value;
  useBalance?: Decimal.Value;
  salesDiscount?: Decimal.Value;
};

export type PricedOrderItem = RawOrderItem & {
  actualPrice: number;
  discount: number;
  itemReceivable: number;
  isGived: boolean;
};

export type OrderPricingResult = {
  originalAmount: number;
  orderAmount: number;
  negotiatedAmount: number;
  bargainRate: number;
  items: PricedOrderItem[];
};

type BuildOrderItemsForCreateInput = CalculateOrderItemPricesInput & {
  orderSn: string;
};

type PersistedOrderItem = {
  toJSON?: () => RawOrderItem;
};

type RecalculatePersistedOrderItemsInput = {
  items: PersistedOrderItem[];
  orderActualAmount: Decimal.Value;
  useBalance?: Decimal.Value;
  updateItem: (id: number | string, values: { actualPrice: number; discount: number }) => Promise<unknown>;
};

const toDecimal = (value: Decimal.Value | null | undefined): Decimal => {
  return new Decimal(value || 0);
};

const toMoney = (value: Decimal): number => {
  return value.toDecimalPlaces(2).toNumber();
};

const parseExtra = (extra: unknown): Record<string, unknown> => {
  if (!extra) {
    return {};
  }
  if (typeof extra === 'object') {
    return extra as Record<string, unknown>;
  }
  if (typeof extra !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(extra);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const buildOrderItemExtra = (item: RawOrderItem, isGived: boolean): string => {
  return JSON.stringify({
    ...parseExtra(item.extra),
    isGived,
  });
};

export const calculateOrderItemPrices = ({
  items,
  orderActualAmount,
  useBalance = 0,
  salesDiscount = DEFAULT_DISCOUNT,
}: CalculateOrderItemPricesInput): OrderPricingResult => {
  const normalizedItems = items.map((item) => {
    const counts = toDecimal(item.counts);
    const originalPrice = toDecimal(item.originalPrice);
    const isGived = Boolean(item.isGived);
    const originalTotal = originalPrice.mul(counts);
    const itemReceivable = isGived ? new Decimal(0) : originalTotal.mul(salesDiscount);

    return {
      ...item,
      counts: counts.toNumber(),
      originalPrice: originalPrice.toNumber(),
      isGived,
      originalTotal,
      itemReceivable,
    };
  });

  const originalAmount = normalizedItems.reduce((sum, item) => {
    return sum.plus(item.originalTotal);
  }, new Decimal(0));

  const orderAmount = normalizedItems.reduce((sum, item) => {
    return sum.plus(item.itemReceivable);
  }, new Decimal(0));

  const negotiatedAmount = toDecimal(orderActualAmount).plus(useBalance);
  const bargainRate = orderAmount.gt(0) ? negotiatedAmount.div(orderAmount) : new Decimal(0);

  const pricedItems = normalizedItems.map((item) => {
    const counts = toDecimal(item.counts);
    const originalPrice = toDecimal(item.originalPrice);
    const actualTotal = item.itemReceivable.mul(bargainRate);
    const actualPrice = counts.gt(0) ? actualTotal.div(counts) : new Decimal(0);
    const discount = originalPrice.gt(0) ? actualPrice.div(originalPrice) : new Decimal(0);

    return {
      ...item,
      actualPrice: item.isGived ? 0 : toMoney(actualPrice),
      discount: item.isGived ? 0 : toMoney(discount),
      itemReceivable: toMoney(item.itemReceivable),
    };
  });

  return {
    originalAmount: toMoney(originalAmount),
    orderAmount: toMoney(orderAmount),
    negotiatedAmount: toMoney(negotiatedAmount),
    bargainRate: bargainRate.toNumber(),
    items: pricedItems,
  };
};

export const buildOrderItemsForCreate = ({
  orderSn,
  items,
  orderActualAmount,
  useBalance = 0,
  salesDiscount = DEFAULT_DISCOUNT,
}: BuildOrderItemsForCreateInput): Array<Record<string, unknown>> => {
  const pricing = calculateOrderItemPrices({
    items,
    orderActualAmount,
    useBalance,
    salesDiscount,
  });

  return pricing.items.map((item) => ({
    orderSn,
    sku: item.sku,
    sn: item.sn,
    name: item.name,
    brand: item.brand,
    color: item.color,
    size: item.size,
    originalPrice: item.originalPrice,
    discount: item.discount,
    counts: item.counts,
    actualPrice: item.actualPrice,
    extra: buildOrderItemExtra(item, item.isGived),
  }));
};

export const recalculatePersistedOrderItems = async ({
  items,
  orderActualAmount,
  useBalance = 0,
  updateItem,
}: RecalculatePersistedOrderItemsInput): Promise<OrderPricingResult> => {
  const effectiveItems = items
    .map((item) => item.toJSON ? item.toJSON() : item as RawOrderItem)
    .filter((item) => toDecimal(item.counts).gt(0));

  const pricing = calculateOrderItemPrices({
    items: effectiveItems,
    orderActualAmount,
    useBalance,
  });

  for (const item of pricing.items) {
    if (item.id === undefined || item.id === null) {
      continue;
    }

    await updateItem(item.id, {
      actualPrice: item.actualPrice,
      discount: item.discount,
    });
  }

  return pricing;
};
