import React, { useCallback, useEffect, useState } from 'react';
import { Edit3, Plus, Shuffle, Tag, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldError } from '../../components/FieldError';
import { useApp } from '../../context/AppContext';
import type { CouponItem } from '../../types';
import { apiFetch } from '../../utils/authSession';
import {
  couponWriteSchema,
  fieldBorderClass,
  type FieldErrors,
  validateWithSchema,
} from '../../utils/formValidation';

interface CourseOption {
  _id: string;
  title: string;
  slug: string;
  price: number;
  currency: string;
  published: boolean;
}

export function AdminCouponsModule() {
  const { showToast } = useApp();
  const [coupons, setCoupons] = useState<CouponItem[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [code, setCode] = useState('');
  const [discountPercent, setDiscountPercent] = useState('20');
  const [courseId, setCourseId] = useState('');
  const [maxUses, setMaxUses] = useState('0');
  const [expiresAt, setExpiresAt] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);

  const [deleteTarget, setDeleteTarget] = useState<CouponItem | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/coupons', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCoupons(data.coupons || []);
        setCourses(data.courses || []);
      } else {
        showToast('Unable to load coupons.', 'error');
      }
    } catch {
      showToast('Network error loading coupons.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const resetForm = () => {
    setEditingId(null);
    setCode('');
    setDiscountPercent('20');
    setCourseId('');
    setMaxUses('0');
    setExpiresAt('');
    setDescription('');
    setActive(true);
    setFieldErrors({});
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (item: CouponItem) => {
    setEditingId(item._id);
    setCode(item.code);
    setDiscountPercent(String(item.discountPercent));
    setCourseId(
      item.courseId && typeof item.courseId === 'object'
        ? String(item.courseId._id)
        : item.courseId
          ? String(item.courseId)
          : ''
    );
    setMaxUses(String(item.maxUses || 0));
    setExpiresAt(item.expiresAt ? new Date(item.expiresAt).toISOString().slice(0, 10) : '');
    setDescription(item.description || '');
    setActive(Boolean(item.active));
    setShowForm(true);
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCode(`NEXA-${suffix}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFieldErrors({});
    const payload = {
      code: code.trim().toUpperCase(),
      discountPercent: Number(discountPercent),
      courseId: courseId || null,
      maxUses: Number(maxUses || 0),
      expiresAt: expiresAt ? `${expiresAt}T23:59:59.999Z` : null,
      description: description.trim(),
      active,
    };
    const check = validateWithSchema(couponWriteSchema, payload);
    if (!check.ok) {
      setFieldErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/admin/coupons/${editingId}` : '/api/admin/coupons';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === 'object') {
          setFieldErrors(data.fieldErrors as FieldErrors);
        }
        showToast(data.error || 'Could not save coupon.', 'error');
        return;
      }
      showToast(editingId ? 'Coupon updated.' : 'Coupon created.', 'success');
      setShowForm(false);
      resetForm();
      await loadCoupons();
    } catch {
      showToast('Network error saving coupon.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CouponItem) => {
    const res = await apiFetch(`/api/admin/coupons/${item._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !item.active }),
    });
    if (res.ok) {
      showToast(
        `${item.code} ${!item.active ? 'activated' : 'paused'}.`,
        'success'
      );
      loadCoupons();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Could not update coupon status.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const res = await apiFetch(`/api/admin/coupons/${deleteTarget._id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      showToast(`Deleted coupon ${deleteTarget.code}.`, 'success');
      setDeleteTarget(null);
      loadCoupons();
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Could not delete coupon.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Course Coupons &amp; Discounts</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Create percentage promo codes for all courses or specific courses and manage redemptions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (showForm && !editingId) {
              setShowForm(false);
            } else {
              openCreate();
            }
          }}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Coupon
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={handleSave}
          noValidate
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">
              {editingId ? 'Edit Coupon Code' : 'Create Course Coupon'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              aria-label="Close form"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="coupon-code" className="block text-xs font-medium mb-1.5">
                Coupon Code *
              </label>
              <div className="flex gap-2">
                <input
                  id="coupon-code"
                  type="text"
                  required
                  aria-invalid={Boolean(fieldErrors.code)}
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    clearFieldError('code');
                  }}
                  placeholder="e.g. LAUNCH25"
                  className={fieldBorderClass(
                    'min-h-[44px] flex-1 min-w-0 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono uppercase',
                    fieldErrors.code
                  )}
                />
                <button
                  type="button"
                  onClick={() => {
                    generateCode();
                    clearFieldError('code');
                  }}
                  title="Generate code"
                  aria-label="Generate random coupon code"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 text-xs font-medium hover:border-[#176BFF]"
                >
                  <Shuffle className="w-4 h-4" />
                </button>
              </div>
              <FieldError error={fieldErrors.code} />
            </div>

            <div>
              <label htmlFor="coupon-percent" className="block text-xs font-medium mb-1.5">
                Discount Percentage (1–100%) *
              </label>
              <input
                id="coupon-percent"
                type="number"
                required
                min={1}
                max={100}
                aria-invalid={Boolean(fieldErrors.discountPercent)}
                value={discountPercent}
                onChange={(e) => {
                  setDiscountPercent(e.target.value);
                  clearFieldError('discountPercent');
                }}
                className={fieldBorderClass(
                  'min-h-[44px] w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                  fieldErrors.discountPercent
                )}
              />
              <FieldError error={fieldErrors.discountPercent} />
            </div>

            <div>
              <label htmlFor="coupon-course" className="block text-xs font-medium mb-1.5">
                Applicable Course
              </label>
              <select
                id="coupon-course"
                aria-invalid={Boolean(fieldErrors.courseId)}
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  clearFieldError('courseId');
                }}
                className={fieldBorderClass(
                  'min-h-[44px] w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  fieldErrors.courseId
                )}
              >
                <option value="">All Paid Courses</option>
                {courses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.title} ({c.currency} {c.price})
                  </option>
                ))}
              </select>
              <FieldError error={fieldErrors.courseId} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="coupon-max-uses" className="block text-xs font-medium mb-1.5">
                Max Uses (0 = unlimited)
              </label>
              <input
                id="coupon-max-uses"
                type="number"
                min={0}
                aria-invalid={Boolean(fieldErrors.maxUses)}
                value={maxUses}
                onChange={(e) => {
                  setMaxUses(e.target.value);
                  clearFieldError('maxUses');
                }}
                className={fieldBorderClass(
                  'min-h-[44px] w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                  fieldErrors.maxUses
                )}
              />
              <FieldError error={fieldErrors.maxUses} />
            </div>

            <div>
              <label htmlFor="coupon-expiry" className="block text-xs font-medium mb-1.5">
                Expiration Date (Optional)
              </label>
              <input
                id="coupon-expiry"
                type="date"
                aria-invalid={Boolean(fieldErrors.expiresAt)}
                value={expiresAt}
                onChange={(e) => {
                  setExpiresAt(e.target.value);
                  clearFieldError('expiresAt');
                }}
                className={fieldBorderClass(
                  'min-h-[44px] w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  fieldErrors.expiresAt
                )}
              />
              <FieldError error={fieldErrors.expiresAt} />
            </div>

            <div>
              <label htmlFor="coupon-desc" className="block text-xs font-medium mb-1.5">
                Short Note / Campaign (Optional)
              </label>
              <input
                id="coupon-desc"
                type="text"
                maxLength={240}
                aria-invalid={Boolean(fieldErrors.description)}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  clearFieldError('description');
                }}
                placeholder="e.g. Early-bird cohort discount"
                className={fieldBorderClass(
                  'min-h-[44px] w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  fieldErrors.description
                )}
              />
              <FieldError error={fieldErrors.description} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <label className="inline-flex items-center gap-2.5 text-sm cursor-pointer min-h-[44px]">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 rounded border-[#DCE3F2] dark:border-[#1A2550] text-[#176BFF]"
              />
              <span>Coupon is active and redeemable</span>
            </label>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2 text-xs font-semibold text-white"
              >
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Coupon'}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Loading coupons...
          </div>
        ) : coupons.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Tag className="w-8 h-8 mx-auto text-[#176BFF] dark:text-[#00D4FF]" />
            <p className="text-sm font-semibold">No course coupons created yet</p>
            <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
              Create your first discount code above to share promotional pricing with learners.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
              {coupons.map((c) => {
                const courseTitle =
                  c.courseId && typeof c.courseId === 'object' ? c.courseId.title : 'All Courses';
                const expired = Boolean(c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now());
                return (
                  <div key={c._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono font-bold text-base text-[#070B24] dark:text-[#F7F8FF]">
                          {c.code}
                        </p>
                        <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] mt-0.5">
                          {courseTitle}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold text-[#176BFF] dark:text-[#00D4FF] tabular-nums">
                        {c.discountPercent}% OFF
                      </span>
                    </div>

                    {c.description && (
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{c.description}</p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                      <span className="font-mono tabular-nums">
                        Uses: {c.usedCount} / {c.maxUses > 0 ? c.maxUses : '∞'}
                      </span>
                      <span>
                        {expired
                          ? 'Expired'
                          : c.expiresAt
                            ? `Expires ${new Date(c.expiresAt).toLocaleDateString()}`
                            : 'No expiry'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(c)}
                        className={`min-h-[44px] flex-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                          c.active
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4]'
                        }`}
                      >
                        {c.active ? 'Active' : 'Paused'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-2 text-xs font-medium"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c)}
                        aria-label={`Delete ${c.code}`}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-red-500/40 text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#DCE3F2] dark:border-[#1A2550] text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                    <th className="p-3.5">Code</th>
                    <th className="p-3.5">Discount</th>
                    <th className="p-3.5">Applies To</th>
                    <th className="p-3.5">Redemptions</th>
                    <th className="p-3.5">Expires</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                  {coupons.map((c) => {
                    const courseTitle =
                      c.courseId && typeof c.courseId === 'object' ? c.courseId.title : 'All Paid Courses';
                    const expired = Boolean(
                      c.expiresAt && new Date(c.expiresAt).getTime() <= Date.now()
                    );
                    return (
                      <tr key={c._id} className="align-middle">
                        <td className="p-3.5">
                          <p className="font-mono font-bold text-[#070B24] dark:text-[#F7F8FF]">
                            {c.code}
                          </p>
                          {c.description && (
                            <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] max-w-xs truncate">
                              {c.description}
                            </p>
                          )}
                        </td>
                        <td className="p-3.5 font-mono font-semibold text-[#176BFF] dark:text-[#00D4FF] tabular-nums">
                          {c.discountPercent}%
                        </td>
                        <td className="p-3.5 text-xs">{courseTitle}</td>
                        <td className="p-3.5 font-mono text-xs tabular-nums">
                          {c.usedCount} / {c.maxUses > 0 ? c.maxUses : 'Unlimited'}
                        </td>
                        <td className="p-3.5 font-mono text-xs tabular-nums">
                          {c.expiresAt ? (
                            <span className={expired ? 'text-red-500' : ''}>
                              {new Date(c.expiresAt).toLocaleDateString()}
                              {expired ? ' (Expired)' : ''}
                            </span>
                          ) : (
                            'Never'
                          )}
                        </td>
                        <td className="p-3.5 text-xs">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(c)}
                            className={`font-semibold hover:underline ${
                              c.active
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-[#4A5578] dark:text-[#AEB8D4]'
                            }`}
                          >
                            {c.active ? 'Active' : 'Paused'}
                          </button>
                        </td>
                        <td className="p-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium hover:border-[#176BFF]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(c)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Coupon Code"
        message={
          deleteTarget
            ? `Permanently delete coupon "${deleteTarget.code}"? Learners will no longer be able to apply this promo code.`
            : ''
        }
        confirmLabel="Delete Coupon"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />
    </div>
  );
}
