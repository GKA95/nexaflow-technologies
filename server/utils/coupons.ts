import mongoose from 'mongoose';
import { Coupon, Course } from '../models.js';

export interface ValidatedCouponResult {
  couponId: string;
  code: string;
  description: string;
  discountPercent: number;
  courseId: string | null;
  courseTitle: string | null;
  expiresAt: string | null;
}

export function calculateCouponDiscount(originalAmount: number, discountPercent: number) {
  const safeOriginal = Math.max(0, Number(originalAmount) || 0);
  const safePercent = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  if (safeOriginal <= 0 || safePercent <= 0) {
    return {
      originalAmount: safeOriginal,
      discountPercent: 0,
      discountAmount: 0,
      finalAmount: safeOriginal,
    };
  }
  const discountAmount = Math.round(((safeOriginal * safePercent) / 100) * 100) / 100;
  const finalAmount = Math.max(0, Math.round((safeOriginal - discountAmount) * 100) / 100);
  return {
    originalAmount: safeOriginal,
    discountPercent: safePercent,
    discountAmount,
    finalAmount,
  };
}

export async function validateCouponForPricing(params: {
  code: string;
  courseId?: string;
}): Promise<
  | { ok: true; coupon: ValidatedCouponResult }
  | { ok: false; status: number; error: string }
> {
  const normalizedCode = String(params.code || '')
    .trim()
    .toUpperCase();
  if (!normalizedCode) {
    return { ok: false, status: 400, error: 'Please enter a coupon code.' };
  }

  const couponDoc = await Coupon.findOne({ code: normalizedCode }).lean();
  if (!couponDoc) {
    return { ok: false, status: 404, error: `Coupon "${normalizedCode}" was not found.` };
  }

  const c = couponDoc as {
    _id: unknown;
    code: string;
    description?: string;
    discountPercent: number;
    courseId?: unknown | null;
    maxUses?: number;
    usedCount?: number;
    expiresAt?: Date | null;
    active?: boolean;
  };

  if (!c.active) {
    return { ok: false, status: 400, error: 'This coupon code is currently inactive.' };
  }

  if (c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: 'This coupon code has expired.' };
  }

  const maxUses = Number(c.maxUses || 0);
  const usedCount = Number(c.usedCount || 0);
  if (maxUses > 0 && usedCount >= maxUses) {
    return { ok: false, status: 400, error: 'This coupon code has reached its redemption limit.' };
  }

  let courseTitle: string | null = null;
  const scopedCourseId = c.courseId ? String(c.courseId) : null;
  if (scopedCourseId && mongoose.Types.ObjectId.isValid(scopedCourseId)) {
    const course = await Course.findById(scopedCourseId).select('title').lean();
    courseTitle = (course as { title?: string } | null)?.title || null;
  }

  if (scopedCourseId && params.courseId && String(params.courseId) !== scopedCourseId) {
    return {
      ok: false,
      status: 400,
      error: courseTitle
        ? `Coupon "${c.code}" is only valid for "${courseTitle}".`
        : 'This coupon code is not valid for the selected course.',
    };
  }

  return {
    ok: true,
    coupon: {
      couponId: String(c._id),
      code: c.code,
      description: String(c.description || ''),
      discountPercent: Number(c.discountPercent),
      courseId: scopedCourseId,
      courseTitle,
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString() : null,
    },
  };
}
