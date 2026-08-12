/**
 * Checkout coupon pricing helpers (reserved — wire into order creation later).
 * Commission base should use the payable amount (amountCents after discount).
 */

export type CouponDiscountInput = {
  discountType: "percent" | "fixed_amount";
  /** percent: basis points (1000 = 10%); fixed_amount: cents */
  discountValue: number;
  minOrderCents?: number;
  maxDiscountCents?: number | null;
};

export type PricedOrder = {
  listPriceCents: number;
  discountCents: number;
  amountCents: number;
};

export function computeCouponDiscount(
  listPriceCents: number,
  coupon: CouponDiscountInput,
): PricedOrder {
  if (listPriceCents < 0) {
    throw Object.assign(new Error("coupon.invalid_price"), { statusCode: 400 });
  }
  const minOrder = coupon.minOrderCents ?? 0;
  if (listPriceCents < minOrder) {
    throw Object.assign(new Error("coupon.min_order_not_met"), {
      statusCode: 400,
    });
  }

  let discount = 0;
  if (coupon.discountType === "percent") {
    const bps = Math.max(0, Math.min(10000, Math.floor(coupon.discountValue)));
    discount = Math.floor((listPriceCents * bps) / 10000);
  } else {
    discount = Math.max(0, Math.floor(coupon.discountValue));
  }

  if (coupon.maxDiscountCents != null) {
    discount = Math.min(discount, coupon.maxDiscountCents);
  }
  discount = Math.min(discount, listPriceCents);

  return {
    listPriceCents,
    discountCents: discount,
    amountCents: listPriceCents - discount,
  };
}
