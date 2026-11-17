import React, { useId, useState } from 'react';
import { CheckCircle2, Tag, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  couponValidateSchema,
  fieldBorderClass,
  validateWithSchema,
} from '../utils/formValidation';

export function CouponApplyBar({
  courseId,
  variant = 'surface',
  compact = false,
}: {
  courseId?: string;
  variant?: 'surface' | 'dark';
  compact?: boolean;
}) {
  const { appliedCoupon, applyCouponCode, clearAppliedCoupon, showToast } = useApp();
  const inputId = useId();
  const [codeInput, setCodeInput] = useState(appliedCoupon?.code || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const couponMatchesCourse =
    appliedCoupon &&
    (!courseId || !appliedCoupon.courseId || String(appliedCoupon.courseId) === String(courseId));

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg('');
    const check = validateWithSchema(couponValidateSchema.pick({ code: true }), {
      code: codeInput,
    });
    if (!check.ok) {
      setErrorMsg(check.fieldErrors.code || check.message);
      return;
    }
    setSubmitting(true);
    try {
      const result = await applyCouponCode(check.data.code.toUpperCase(), courseId);
      if (!result.ok) {
        setErrorMsg(result.error);
        return;
      }
      setCodeInput(result.coupon.code);
      const scope = result.coupon.courseTitle
        ? `on ${result.coupon.courseTitle}`
        : 'on all eligible courses';
      showToast(
        `Coupon ${result.coupon.code} applied (${result.coupon.discountPercent}% off ${scope}).`,
        'success'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = () => {
    clearAppliedCoupon();
    setCodeInput('');
    setErrorMsg('');
    showToast('Coupon removed.', 'info');
  };

  const containerCls =
    variant === 'dark'
      ? 'rounded-xl border border-[#1A2550] bg-[#080D2B] text-[#F7F8FF]'
      : 'rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-[#EEF2FA]/70 dark:bg-[#080D2B] text-[#070B24] dark:text-[#F7F8FF]';

  const inputCls =
    variant === 'dark'
      ? 'border-[#1A2550] bg-[#03051B] text-[#F7F8FF] placeholder:text-[#AEB8D4]/60'
      : 'border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#03051B] text-[#070B24] dark:text-[#F7F8FF] placeholder:text-[#4A5578]/60 dark:placeholder:text-[#AEB8D4]/50';

  const mutedCls =
    variant === 'dark' ? 'text-[#AEB8D4]' : 'text-[#4A5578] dark:text-[#AEB8D4]';

  return (
    <div className={`${containerCls} ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#176BFF] dark:text-[#00D4FF] shrink-0" />
            <label htmlFor={inputId} className="text-sm font-semibold">
              Have a Course Coupon Code?
            </label>
          </div>
          <p className={`mt-1 text-xs leading-relaxed ${mutedCls}`}>
            {couponMatchesCourse && appliedCoupon
              ? `Active: ${appliedCoupon.code} (${appliedCoupon.discountPercent}% off ${
                  appliedCoupon.courseTitle ? appliedCoupon.courseTitle : 'all paid courses'
                }).`
              : appliedCoupon && !couponMatchesCourse
                ? `Saved coupon ${appliedCoupon.code} applies to "${
                    appliedCoupon.courseTitle || 'another course'
                  }". Enter another code if needed.`
                : 'Enter a promo code to preview your discounted price automatically.'}
          </p>
        </div>

        <form onSubmit={handleApply} noValidate className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <input
            id={inputId}
            type="text"
            aria-invalid={Boolean(errorMsg)}
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              if (errorMsg) setErrorMsg('');
            }}
            placeholder="e.g. NEXA25"
            autoCapitalize="characters"
            autoComplete="off"
            className={fieldBorderClass(
              `min-h-[44px] w-full sm:w-44 rounded-lg border px-3.5 py-2 text-sm font-mono uppercase focus:outline-none focus:border-[#176BFF] ${inputCls}`,
              errorMsg
            )}
          />
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] inline-flex items-center justify-center rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
          >
            {submitting ? 'Checking...' : 'Apply Coupon'}
          </button>
          {appliedCoupon && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Remove applied coupon"
              className={`min-h-[44px] inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                variant === 'dark'
                  ? 'border-[#1A2550] text-[#AEB8D4] hover:text-white hover:border-red-400/50'
                  : 'border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4] hover:text-red-500'
              }`}
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}
        </form>
      </div>

      {couponMatchesCourse && appliedCoupon && (
        <div className="mt-3 pt-3 border-t border-[#DCE3F2]/70 dark:border-[#1A2550] flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>
            <strong className="font-mono">{appliedCoupon.code}</strong> · {appliedCoupon.discountPercent}% discount active
            {appliedCoupon.description ? ` — ${appliedCoupon.description}` : ''}
          </span>
        </div>
      )}

      {errorMsg && (
        <p role="alert" className="mt-2.5 text-xs text-red-600 dark:text-red-400 font-medium">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
