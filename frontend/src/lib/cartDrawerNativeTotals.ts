/**
 * Cart drawer amounts are NATIVE amounts, not canonical USD amounts.
 * UYU local catalog values must never be passed to USD->UYU formatters.
 * This is a display-only estimate: checkout/server determine real shipping.
 */
export interface CartDrawerMoneyItem {
  price: number;
  quantity: number;
  currency?: string;
  is_international?: boolean;
}

export function getCartDrawerNativeTotals(
  items: CartDrawerMoneyItem[],
  itemDiscounts: number[],
  freeShippingThresholdUYU: number,
  localShippingEstimateUYU = 350,
) {
  let subtotalUYU = 0;
  let subtotalUSD = 0;
  let discountUYU = 0;
  let discountUSD = 0;

  items.forEach((item, index) => {
    const isUSD = item.currency === 'USD' || item.is_international === true;
    const amount = Number(item.price) * Number(item.quantity);
    const rawDiscount = Number(itemDiscounts[index] || 0);
    const discount = Number.isFinite(rawDiscount) ? Math.max(0, Math.min(rawDiscount, amount)) : 0;
    if (isUSD) {
      subtotalUSD += amount;
      discountUSD += discount;
    } else {
      subtotalUYU += amount;
      discountUYU += discount;
    }
  });

  const netUYU = Math.max(0, subtotalUYU - discountUYU);
  const netUSD = Math.max(0, subtotalUSD - discountUSD);
  const hasUYU = items.some(item => item.currency !== 'USD' && item.is_international !== true);
  const hasUSD = items.some(item => item.currency === 'USD' || item.is_international === true);
  const threshold = Number.isFinite(freeShippingThresholdUYU) && freeShippingThresholdUYU > 0
    ? freeShippingThresholdUYU : 4000;
  const shippingUYU = hasUYU && !hasUSD
    ? (netUYU >= threshold ? 0 : localShippingEstimateUYU)
    : null;

  return {
    hasUYU,
    hasUSD,
    isMixed: hasUYU && hasUSD,
    netUYU,
    netUSD,
    discountUYU,
    discountUSD,
    shippingUYU,
    estimatedGrandTotalUYU: shippingUYU === null ? null : netUYU + shippingUYU,
    freeShippingRemainingUYU: Math.max(0, threshold - netUYU),
    freeShippingProgress: Math.min(100, netUYU / threshold * 100),
  };
}
