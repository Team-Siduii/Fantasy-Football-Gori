export const WK_TRANSFER_PRICE_OFFSET_MILLIONS = 3;
export const WK_TRANSFER_PRICE_OFFSET_UNITS = WK_TRANSFER_PRICE_OFFSET_MILLIONS * 1_000_000;

export function applyWkTransferPriceOffsetMillions(price: number) {
  return Math.max(0, Number((price - WK_TRANSFER_PRICE_OFFSET_MILLIONS).toFixed(2)));
}

export function applyWkTransferPriceOffsetUnits(value: number) {
  return Math.max(0, value - WK_TRANSFER_PRICE_OFFSET_UNITS);
}