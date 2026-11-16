import type { AppliedCoupon, CourseDiscountPricing, CourseItem } from '../types';

export function getCourseDiscountPricing(
  course: Pick<CourseItem, '_id' | 'price'>,
  appliedCoupon: AppliedCoupon | null
): CourseDiscountPricing {
  const originalPrice = Math.max(0, Number(course.price) || 0);
  if (!appliedCoupon || originalPrice <= 0) {
    return {
      applies: false,
      originalPrice,
      discountPercent: 0,
      discountAmount: 0,
      finalPrice: originalPrice,
    };
  }

  if (appliedCoupon.courseId && String(appliedCoupon.courseId) !== String(course._id)) {
    return {
      applies: false,
      originalPrice,
      discountPercent: 0,
      discountAmount: 0,
      finalPrice: originalPrice,
    };
  }

  const pct = Math.min(100, Math.max(0, Number(appliedCoupon.discountPercent) || 0));
  if (pct <= 0) {
    return {
      applies: false,
      originalPrice,
      discountPercent: 0,
      discountAmount: 0,
      finalPrice: originalPrice,
    };
  }

  const discountAmount = Math.round(((originalPrice * pct) / 100) * 100) / 100;
  const finalPrice = Math.max(0, Math.round((originalPrice - discountAmount) * 100) / 100);

  return {
    applies: true,
    originalPrice,
    discountPercent: pct,
    discountAmount,
    finalPrice,
  };
}

export function formatMoneyAmount(amount: number): string {
  if (!Number.isFinite(amount)) return '0';
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}
