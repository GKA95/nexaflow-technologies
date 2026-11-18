import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Eye, EyeOff, Plus, RotateCcw, Send, Trash2 } from 'lucide-react';
import { estimateReadingTimeMinutes } from '../../../server/shared/richText';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldError } from '../../components/FieldError';
import { MediaImage } from '../../components/MediaImage';
import { RichContentRenderer } from '../../components/RichContentRenderer';
import { LazyRichTextEditor } from '../../components/admin/LazyRichTextEditor';
import { StructuredListEditor } from '../../components/admin/StructuredListEditor';
import { useApp } from '../../context/AppContext';
import type { ArticleItem, ProductItem, ServiceItem, SupportTicketItem } from '../../types';
import { apiFetch } from '../../utils/authSession';
import {
  articleWriteSchema,
  fieldBorderClass,
  type FieldErrors,
  productWriteSchema,
  serviceWriteSchema,
  supportReplySchema,
  validateWithSchema,
} from '../../utils/formValidation';

export function AdminProductsModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [editing, setEditing] = useState<Partial<ProductItem> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [delTarget, setDelTarget] = useState<ProductItem | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/products', { credentials: 'include' });
    if (res.ok) setProducts((await res.json()).products || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty || !editing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, editing]);

  const requestOpenProduct = (next: Partial<ProductItem> | null) => {
    const apply = () => {
      setErrors({});
      setPreviewMode(false);
      setDirty(false);
      setEditing(next);
    };
    if (dirty && editing) {
      setDiscardAction(() => apply);
    } else {
      apply();
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    const candidate = {
      name: editing.name || '',
      slug: editing.slug || '',
      category: editing.category || 'Software Product',
      shortDescription: editing.shortDescription || '',
      fullDescription: editing.fullDescription || '',
      features: (editing.features || []).map((s) => s.trim()).filter(Boolean),
      benefits: (editing.benefits || []).map((s) => s.trim()).filter(Boolean),
      images: editing.images || [],
      demoLink: editing.demoLink || '',
      pricingStatus: editing.pricingStatus || 'Contact for Pricing',
      published: Boolean(editing.published),
      order: Number(editing.order ?? 0),
    };
    const check = validateWithSchema(productWriteSchema, candidate);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const isNew = !editing._id;
      const res = await apiFetch(
        isNew ? '/api/admin/products' : `/api/admin/products/${editing._id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(check.data),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Product saved.', 'success');
        setEditing(null);
        setDirty(false);
        setPreviewMode(false);
        setErrors({});
        load();
        refreshBootstrap();
      } else {
        if (d.fieldErrors) setErrors(d.fieldErrors);
        showToast(d.error || 'Failed to save product.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Product Management</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Manage GridMind AI and additional software products.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            requestOpenProduct({
              name: '',
              slug: '',
              category: 'AI Software',
              shortDescription: '',
              fullDescription: '',
              features: [],
              benefits: [],
              images: [],
              demoLink: '',
              pricingStatus: 'Contact for Pricing',
              published: true,
              order: products.length + 1,
            })
          }
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Product
        </button>
      </div>

      {editing && (
        <form
          onSubmit={save}
          noValidate
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">
              {editing._id ? `Edit Product: ${editing.name}` : 'Create Product'}
            </h2>
            <button
              type="button"
              onClick={() => setPreviewMode((p) => !p)}
              className="text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
            >
              {previewMode ? 'Back to Editor' : 'Preview Overview'}
            </button>
          </div>

          {previewMode ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-6 space-y-4">
              <p className="text-xs font-mono text-[#176BFF] dark:text-[#00D4FF]">
                {editing.category || 'Product'} · {editing.pricingStatus || 'Contact for Pricing'}
              </p>
              <h3 className="text-2xl font-bold">{editing.name || 'Untitled Product'}</h3>
              {editing.shortDescription && (
                <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  {editing.shortDescription}
                </p>
              )}
              <RichContentRenderer content={editing.fullDescription || ''} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <input
                    placeholder="Product Name *"
                    value={editing.name || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, name: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, name: '' }));
                    }}
                    aria-invalid={Boolean(errors.name)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.name
                    )}
                  />
                  <FieldError message={errors.name} />
                </div>
                <div>
                  <input
                    placeholder="Category"
                    value={editing.category || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, category: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, category: '' }));
                    }}
                    aria-invalid={Boolean(errors.category)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.category
                    )}
                  />
                  <FieldError message={errors.category} />
                </div>
                <div>
                  <input
                    placeholder="Pricing / Availability Status"
                    value={editing.pricingStatus || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, pricingStatus: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, pricingStatus: '' }));
                    }}
                    aria-invalid={Boolean(errors.pricingStatus)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.pricingStatus
                    )}
                  />
                  <FieldError message={errors.pricingStatus} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <input
                    placeholder="Demo URL (optional)"
                    value={editing.demoLink || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, demoLink: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, demoLink: '' }));
                    }}
                    aria-invalid={Boolean(errors.demoLink)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.demoLink
                    )}
                  />
                  <FieldError message={errors.demoLink} />
                </div>
                <div>
                  <input
                    placeholder="Image URL"
                    value={editing.images?.[0] || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, images: e.target.value ? [e.target.value] : [] });
                      setDirty(true);
                      setErrors((p) => ({ ...p, 'images.0': '', images: '' }));
                    }}
                    aria-invalid={Boolean(errors['images.0'] || errors.images)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors['images.0'] || errors.images
                    )}
                  />
                  <FieldError message={errors['images.0'] || errors.images} />
                </div>
              </div>
              <div>
                <textarea
                  rows={2}
                  placeholder="Short Description *"
                  value={editing.shortDescription || ''}
                  onChange={(e) => {
                    setEditing({ ...editing, shortDescription: e.target.value });
                    setDirty(true);
                    setErrors((p) => ({ ...p, shortDescription: '' }));
                  }}
                  aria-invalid={Boolean(errors.shortDescription)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    errors.shortDescription
                  )}
                />
                <FieldError message={errors.shortDescription} />
              </div>

              <LazyRichTextEditor
                label="Full Product Description"
                compact
                minHeightClass="min-h-[200px]"
                value={editing.fullDescription || ''}
                onChange={(html) => {
                  setEditing((prev) => (prev ? { ...prev, fullDescription: html } : prev));
                  setDirty(true);
                  setErrors((p) => ({ ...p, fullDescription: '' }));
                }}
                placeholder="Write a comprehensive product overview with headings, bullet points, links, and formatting..."
                error={errors.fullDescription}
                saveStatus={saving ? 'saving' : dirty ? 'dirty' : 'idle'}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StructuredListEditor
                  label="Core Capabilities / Features"
                  items={editing.features || []}
                  onChange={(next) => {
                    setEditing({ ...editing, features: next });
                    setDirty(true);
                  }}
                  placeholder="Add a product feature..."
                  emptyHint="No features added yet."
                />
                <StructuredListEditor
                  label="Business Benefits"
                  items={editing.benefits || []}
                  onChange={(next) => {
                    setEditing({ ...editing, benefits: next });
                    setDirty(true);
                  }}
                  placeholder="Add a business benefit..."
                  emptyHint="No benefits added yet."
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.published)}
                  onChange={(e) => {
                    setEditing({ ...editing, published: e.target.checked });
                    setDirty(true);
                  }}
                />
                Published
              </label>
            </>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
            >
              {saving ? 'Saving...' : 'Save Product'}
            </button>
            <button
              type="button"
              onClick={() => requestOpenProduct(null)}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {products.map((p) => (
          <div
            key={p._id}
            className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                {p.published ? 'Published' : 'Unpublished'} · {p.category} · {p.pricingStatus}
              </p>
              <h2 className="font-bold text-lg">{p.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => requestOpenProduct(p)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setDelTarget(p)}
                className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 text-red-500 px-3 py-1.5 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(delTarget)}
        title="Delete Product"
        message={`Delete "${delTarget?.name}"?`}
        onConfirm={async () => {
          if (delTarget?._id) {
            await apiFetch(`/api/admin/products/${delTarget._id}`, { method: 'DELETE', credentials: 'include' });
            setDelTarget(null);
            load();
            refreshBootstrap();
          }
        }}
        onCancel={() => setDelTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(discardAction)}
        title="Discard Unsaved Changes?"
        message="You have unsaved changes to this product. Leave without saving?"
        confirmLabel="Discard Changes"
        onConfirm={() => {
          const fn = discardAction;
          setDiscardAction(null);
          fn?.();
        }}
        onCancel={() => setDiscardAction(null)}
      />
    </div>
  );
}

export function AdminServicesModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editing, setEditing] = useState<Partial<ServiceItem> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/services', { credentials: 'include' });
    if (res.ok) setServices((await res.json()).services || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty || !editing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, editing]);

  const requestOpenService = (next: Partial<ServiceItem> | null) => {
    const apply = () => {
      setErrors({});
      setPreviewMode(false);
      setDirty(false);
      setEditing(next);
    };
    if (dirty && editing) {
      setDiscardAction(() => apply);
    } else {
      apply();
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    const candidate = {
      name: editing.name || '',
      slug: editing.slug || '',
      shortDescription: editing.shortDescription || '',
      overview: editing.overview || '',
      problemsAddressed: (editing.problemsAddressed || []).map((s) => s.trim()).filter(Boolean),
      deliverables: (editing.deliverables || []).map((s) => s.trim()).filter(Boolean),
      ctaLabel: editing.ctaLabel || 'Request Consultation',
      coverImage: editing.coverImage || '',
      published: Boolean(editing.published),
      order: Number(editing.order ?? 0),
    };
    const check = validateWithSchema(serviceWriteSchema, candidate);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const isNew = !editing._id;
      const res = await apiFetch(
        isNew ? '/api/admin/services' : `/api/admin/services/${editing._id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(check.data),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Service saved.', 'success');
        setEditing(null);
        setDirty(false);
        setPreviewMode(false);
        setErrors({});
        load();
        refreshBootstrap();
      } else {
        if (d.fieldErrors) setErrors(d.fieldErrors);
        showToast(d.error || 'Failed to save service.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Service Pages Manager</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Add, edit, reorder, publish, and unpublish solution landing pages.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            requestOpenService({
              name: '',
              slug: '',
              shortDescription: '',
              overview: '',
              problemsAddressed: [],
              deliverables: [],
              ctaLabel: 'Request Consultation',
              published: true,
              order: services.length + 1,
            })
          }
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Service
        </button>
      </div>

      {editing && (
        <form
          onSubmit={save}
          noValidate
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold">
              {editing._id ? `Edit Service: ${editing.name}` : 'Create Service Page'}
            </h2>
            <button
              type="button"
              onClick={() => setPreviewMode((p) => !p)}
              className="text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
            >
              {previewMode ? 'Back to Editor' : 'Preview Overview'}
            </button>
          </div>

          {previewMode ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-6 space-y-4">
              <h3 className="text-2xl font-bold">{editing.name || 'Untitled Service'}</h3>
              {editing.shortDescription && (
                <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  {editing.shortDescription}
                </p>
              )}
              <RichContentRenderer content={editing.overview || ''} />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <input
                    placeholder="Service Name *"
                    value={editing.name || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, name: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, name: '' }));
                    }}
                    aria-invalid={Boolean(errors.name)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.name
                    )}
                  />
                  <FieldError message={errors.name} />
                </div>
                <div>
                  <input
                    type="number"
                    placeholder="Order"
                    value={editing.order ?? 1}
                    onChange={(e) => {
                      setEditing({ ...editing, order: Number(e.target.value) });
                      setDirty(true);
                      setErrors((p) => ({ ...p, order: '' }));
                    }}
                    aria-invalid={Boolean(errors.order)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.order
                    )}
                  />
                  <FieldError message={errors.order} />
                </div>
                <div>
                  <input
                    placeholder="CTA Button Label"
                    value={editing.ctaLabel || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, ctaLabel: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, ctaLabel: '' }));
                    }}
                    aria-invalid={Boolean(errors.ctaLabel)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.ctaLabel
                    )}
                  />
                  <FieldError message={errors.ctaLabel} />
                </div>
              </div>
              <div>
                <textarea
                  rows={2}
                  placeholder="Short Description *"
                  value={editing.shortDescription || ''}
                  onChange={(e) => {
                    setEditing({ ...editing, shortDescription: e.target.value });
                    setDirty(true);
                    setErrors((p) => ({ ...p, shortDescription: '' }));
                  }}
                  aria-invalid={Boolean(errors.shortDescription)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    errors.shortDescription
                  )}
                />
                <FieldError message={errors.shortDescription} />
              </div>

              <LazyRichTextEditor
                label="Detailed Service Overview"
                compact
                minHeightClass="min-h-[220px]"
                value={editing.overview || ''}
                onChange={(html) => {
                  setEditing((prev) => (prev ? { ...prev, overview: html } : prev));
                  setDirty(true);
                  setErrors((p) => ({ ...p, overview: '' }));
                }}
                placeholder="Write detailed solution overview, architecture breakdown, and implementation scope..."
                error={errors.overview}
                saveStatus={saving ? 'saving' : dirty ? 'dirty' : 'idle'}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StructuredListEditor
                  label="Problems Addressed"
                  items={editing.problemsAddressed || []}
                  onChange={(next) => {
                    setEditing({ ...editing, problemsAddressed: next });
                    setDirty(true);
                  }}
                  placeholder="Add problem addressed..."
                  emptyHint="No problems listed yet."
                />
                <StructuredListEditor
                  label="Core Deliverables"
                  items={editing.deliverables || []}
                  onChange={(next) => {
                    setEditing({ ...editing, deliverables: next });
                    setDirty(true);
                  }}
                  placeholder="Add deliverable..."
                  emptyHint="No deliverables listed yet."
                />
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(editing.published)}
                  onChange={(e) => {
                    setEditing({ ...editing, published: e.target.checked });
                    setDirty(true);
                  }}
                />
                Published
              </label>
            </>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
            >
              {saving ? 'Saving...' : 'Save Service'}
            </button>
            <button
              type="button"
              onClick={() => requestOpenService(null)}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {services.map((s) => (
          <div
            key={s._id || s.slug}
            className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex flex-wrap items-center justify-between gap-4"
          >
            <div>
              <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                Order #{s.order} · {s.published ? 'Published' : 'Hidden'} · /solutions/{s.slug}
              </p>
              <h2 className="font-bold text-lg">{s.name}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/admin/services/${s._id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ published: !s.published }),
                  });
                  load();
                  refreshBootstrap();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs"
              >
                {s.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {s.published ? 'Unpublish' : 'Publish'}
              </button>
              <button
                type="button"
                onClick={() => requestOpenService(s)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(discardAction)}
        title="Discard Unsaved Changes?"
        message="You have unsaved changes to this service page. Leave without saving?"
        confirmLabel="Discard Changes"
        onConfirm={() => {
          const fn = discardAction;
          setDiscardAction(null);
          fn?.();
        }}
        onCancel={() => setDiscardAction(null)}
      />
    </div>
  );
}

interface StoredArticleDraft {
  data: Partial<ArticleItem>;
  savedAt: number;
}

function getArticleDraftKey(articleId?: string): string {
  return `nexaflow_draft_article_${articleId || 'new'}`;
}

export function AdminBlogModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [editing, setEditing] = useState<Partial<ArticleItem> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'local-draft'>('idle');
  const [recoverableDraft, setRecoverableDraft] = useState<StoredArticleDraft | null>(null);
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/articles', { credentials: 'include' });
    if (res.ok) setArticles((await res.json()).articles || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dirty || !editing) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, editing]);

  // Debounced local auto-draft backup so edits aren't lost across accidental reloads
  useEffect(() => {
    if (!editing || !dirty) return;
    setSaveState('dirty');
    const timer = window.setTimeout(() => {
      try {
        const key = getArticleDraftKey(editing._id);
        const payload: StoredArticleDraft = { data: editing, savedAt: Date.now() };
        localStorage.setItem(key, JSON.stringify(payload));
        setSaveState('local-draft');
      } catch {
        // Ignore storage quota issues
      }
    }, 900);
    return () => window.clearTimeout(timer);
  }, [editing, dirty]);

  const openArticleEditor = (next: Partial<ArticleItem> | null) => {
    const apply = () => {
      setErrors({});
      setPreviewMode(false);
      setDirty(false);
      setSaveState('idle');
      setRecoverableDraft(null);
      setEditing(next);

      if (next) {
        try {
          const raw = localStorage.getItem(getArticleDraftKey(next._id));
          if (raw) {
            const parsed = JSON.parse(raw) as StoredArticleDraft;
            if (
              parsed?.data &&
              (parsed.data.content !== next.content ||
                parsed.data.title !== next.title ||
                parsed.data.excerpt !== next.excerpt)
            ) {
              setRecoverableDraft(parsed);
            }
          }
        } catch {
          // Ignore malformed draft
        }
      }
    };

    if (dirty && editing) {
      setDiscardAction(() => apply);
    } else {
      apply();
    }
  };

  const persistArticle = async (statusOverride?: 'draft' | 'published') => {
    if (!editing || saving) return;
    const effectiveStatus = (statusOverride || editing.status || 'draft') as 'draft' | 'published';
    const candidate = {
      title: editing.title || '',
      slug: editing.slug || '',
      excerpt: editing.excerpt || '',
      content: editing.content || '',
      featuredImage: editing.featuredImage || '',
      category: editing.category || 'Engineering',
      tags: editing.tags || [],
      authorName: editing.authorName || 'NexaFlow Editorial',
      status: effectiveStatus,
      ctaLabel: editing.ctaLabel || '',
      ctaHref: editing.ctaHref || '',
    };
    const check = validateWithSchema(articleWriteSchema, candidate);
    if (!check.ok) {
      setErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveState('saving');
    try {
      const isNew = !editing._id;
      const res = await apiFetch(
        isNew ? '/api/admin/articles' : `/api/admin/articles/${editing._id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...editing, ...check.data, status: effectiveStatus }),
        }
      );
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        try {
          localStorage.removeItem(getArticleDraftKey(editing._id));
        } catch {
          // Ignore
        }
        showToast(
          effectiveStatus === 'published' ? 'Article published!' : 'Article draft saved.',
          'success'
        );
        setEditing(null);
        setDirty(false);
        setSaveState('idle');
        setRecoverableDraft(null);
        setPreviewMode(false);
        setErrors({});
        load();
        refreshBootstrap();
      } else {
        setSaveState('dirty');
        if (d.fieldErrors) setErrors(d.fieldErrors);
        showToast(d.error || 'Error saving article.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await persistArticle();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">NexaFlow Insights CMS</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Write, preview, draft, publish, and manage SEO metadata for blog articles.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            openArticleEditor({
              title: '',
              slug: '',
              excerpt: '',
              content: '',
              category: 'AI & Automation',
              tags: [],
              authorName: 'NexaFlow Editorial',
              status: 'draft',
              ctaLabel: 'Request Consultation',
              ctaHref: '/contact?type=consultation',
            })
          }
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Article
        </button>
      </div>

      {editing && (
        <form
          onSubmit={save}
          noValidate
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold">{editing._id ? 'Edit Article' : 'New Article'}</h2>
              <span
                className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded border ${
                  editing.status === 'published'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                }`}
              >
                {editing.status === 'published' ? 'Published' : 'Draft'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewMode((p) => !p)}
              className="text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
            >
              {previewMode ? 'Back to Editor' : 'Preview Layout'}
            </button>
          </div>

          {recoverableDraft && (
            <div className="rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[#070B24] dark:text-[#F7F8FF]">
                A local unsaved draft from{' '}
                <strong>{new Date(recoverableDraft.savedAt).toLocaleTimeString()}</strong> was
                found in your browser.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditing({ ...editing, ...recoverableDraft.data });
                    setRecoverableDraft(null);
                    setDirty(true);
                    showToast('Local draft restored.', 'info');
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-[#176BFF] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <RotateCcw className="w-3 h-3" />
                  Restore Draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      localStorage.removeItem(getArticleDraftKey(editing._id));
                    } catch {
                      // Ignore
                    }
                    setRecoverableDraft(null);
                  }}
                  className="rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {previewMode ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-6 sm:p-8 space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                <span className="text-[#176BFF] dark:text-[#00D4FF]">{editing.category}</span>
                <span>·</span>
                <span>By {editing.authorName || 'NexaFlow Editorial'}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {estimateReadingTimeMinutes(editing.content)} min read
                </span>
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold leading-tight">
                {editing.title || 'Untitled Article'}
              </h3>
              {editing.excerpt && (
                <p className="text-base text-[#4A5578] dark:text-[#AEB8D4]">{editing.excerpt}</p>
              )}
              {editing.featuredImage?.trim() && (
                <div className="aspect-video w-full max-w-2xl rounded-xl overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] bg-[#080D2B]">
                  <MediaImage
                    src={editing.featuredImage}
                    alt={editing.title || 'Article cover preview'}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="pt-2 border-t border-[#DCE3F2] dark:border-[#1A2550]">
                <RichContentRenderer content={editing.content || ''} />
              </div>
              {(editing.tags || []).length > 0 && (
                <div className="pt-4 border-t border-[#DCE3F2] dark:border-[#1A2550] flex flex-wrap gap-2 text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                  {(editing.tags || []).map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <input
                    placeholder="Article Title *"
                    value={editing.title || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, title: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, title: '' }));
                    }}
                    aria-invalid={Boolean(errors.title)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.title
                    )}
                  />
                  <FieldError message={errors.title} />
                </div>
                <div>
                  <input
                    placeholder="URL Slug (auto if blank)"
                    value={editing.slug || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, slug: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, slug: '' }));
                    }}
                    aria-invalid={Boolean(errors.slug)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.slug
                    )}
                  />
                  <FieldError message={errors.slug} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <input
                    placeholder="Category"
                    value={editing.category || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, category: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, category: '' }));
                    }}
                    aria-invalid={Boolean(errors.category)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.category
                    )}
                  />
                  <FieldError message={errors.category} />
                </div>
                <div>
                  <input
                    placeholder="Author Display Name"
                    value={editing.authorName || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, authorName: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, authorName: '' }));
                    }}
                    aria-invalid={Boolean(errors.authorName)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.authorName
                    )}
                  />
                  <FieldError message={errors.authorName} />
                </div>
                <select
                  value={editing.status || 'draft'}
                  onChange={(e) => {
                    setEditing({ ...editing, status: e.target.value as 'draft' | 'published' });
                    setDirty(true);
                  }}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <div>
                  <input
                    placeholder="Featured Image URL"
                    value={editing.featuredImage || ''}
                    onChange={(e) => {
                      setEditing({ ...editing, featuredImage: e.target.value });
                      setDirty(true);
                      setErrors((p) => ({ ...p, featuredImage: '' }));
                    }}
                    aria-invalid={Boolean(errors.featuredImage)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      errors.featuredImage
                    )}
                  />
                  <FieldError message={errors.featuredImage} />
                </div>
              </div>

              <div>
                <textarea
                  rows={2}
                  placeholder="Excerpt / Summary"
                  value={editing.excerpt || ''}
                  onChange={(e) => {
                    setEditing({ ...editing, excerpt: e.target.value });
                    setDirty(true);
                    setErrors((p) => ({ ...p, excerpt: '' }));
                  }}
                  aria-invalid={Boolean(errors.excerpt)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    errors.excerpt
                  )}
                />
                <FieldError message={errors.excerpt} />
              </div>

              <LazyRichTextEditor
                label="Article Body *"
                minHeightClass="min-h-[340px]"
                value={editing.content || ''}
                onChange={(html) => {
                  setEditing((prev) => (prev ? { ...prev, content: html } : prev));
                  setDirty(true);
                  setErrors((p) => ({ ...p, content: '' }));
                }}
                placeholder="Write your article with headings, formatted callouts, code snippets, tables, and visual assets..."
                error={errors.content}
                saveStatus={saveState}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  placeholder="Tags (comma separated)"
                  value={(editing.tags || []).join(', ')}
                  onChange={(e) => {
                    setEditing({
                      ...editing,
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    });
                    setDirty(true);
                  }}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <input
                  placeholder="SEO Title"
                  value={editing.seoTitle || ''}
                  onChange={(e) => {
                    setEditing({ ...editing, seoTitle: e.target.value });
                    setDirty(true);
                  }}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>
              <input
                placeholder="SEO Meta Description"
                value={editing.seoDescription || ''}
                onChange={(e) => {
                  setEditing({ ...editing, seoDescription: e.target.value });
                  setDirty(true);
                }}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistArticle('draft')}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] hover:border-[#176BFF] disabled:opacity-60 px-4 py-2 text-xs font-semibold"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void persistArticle('published')}
              className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
            >
              {saving ? 'Publishing...' : 'Save & Publish'}
            </button>
            <button
              type="button"
              onClick={() => openArticleEditor(null)}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {articles.length === 0 ? (
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          No articles created yet.
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((a) => (
            <div
              key={a._id}
              className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex flex-wrap items-center justify-between gap-4"
            >
              <div>
                <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                  {a.status.toUpperCase()} · {a.category} · {a.readingTimeMinutes} min read
                </p>
                <h2 className="font-bold text-lg">{a.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openArticleEditor(a)}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/admin/articles/${a._id}`, {
                      method: 'DELETE',
                      credentials: 'include',
                    });
                    load();
                    refreshBootstrap();
                  }}
                  className="rounded-lg border border-red-500/40 text-red-500 px-3 py-1.5 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(discardAction)}
        title="Discard Unsaved Article Changes?"
        message="You have unsaved changes in this article. Leave without saving to the database?"
        confirmLabel="Discard Changes"
        onConfirm={() => {
          const fn = discardAction;
          setDiscardAction(null);
          fn?.();
        }}
        onCancel={() => setDiscardAction(null)}
      />
    </div>
  );
}

export function AdminSupportModule() {
  const { showToast } = useApp();
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [activeTicket, setActiveTicket] = useState<SupportTicketItem | null>(null);
  const [messages, setMessages] = useState<
    Array<{ _id: string; senderRole: string; senderName: string; message: string; createdAt: string }>
  >([]);
  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/tickets', { credentials: 'include' });
    if (res.ok) setTickets((await res.json()).tickets || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = async (t: SupportTicketItem) => {
    setActiveTicket(t);
    setReplyError('');
    const res = await apiFetch(`/api/admin/tickets/${t._id}`, { credentials: 'include' });
    if (res.ok) setMessages((await res.json()).messages || []);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || sendingReply) return;
    const check = validateWithSchema(supportReplySchema, { message: reply });
    if (!check.ok) {
      setReplyError(check.fieldErrors.message || check.message);
      showToast(check.message, 'error');
      return;
    }
    setReplyError('');
    setSendingReply(true);
    try {
      const res = await apiFetch(`/api/admin/tickets/${activeTicket._id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: check.data.message }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReply('');
        openTicket(activeTicket);
        load();
        showToast('Reply sent to learner.', 'success');
      } else {
        setReplyError(data.error || 'Could not send reply.');
        showToast(data.error || 'Could not send reply.', 'error');
      }
    } finally {
      setSendingReply(false);
    }
  };

  const changeStatus = async (status: string) => {
    if (!activeTicket) return;
    const res = await apiFetch(`/api/admin/tickets/${activeTicket._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setActiveTicket({ ...activeTicket, status: status as SupportTicketItem['status'] });
      load();
      showToast('Ticket status updated.', 'success');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Learner Support &amp; Ticket Desk</h1>
        <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          Respond to learner questions, topic clarifications, technical issues, and complaints.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
          {tickets.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
              No support tickets submitted yet.
            </div>
          ) : (
            <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
              {tickets.map((t) => (
                <li key={t._id}>
                  <button
                    type="button"
                    onClick={() => openTicket(t)}
                    className={`w-full text-left p-4 hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] ${
                      activeTicket?._id === t._id ? 'bg-[#EEF2FA] dark:bg-[#10183A]' : ''
                    }`}
                  >
                    <div className="flex justify-between text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                      <span className="font-mono">{t.referenceNumber}</span>
                      <span>{t.status}</span>
                    </div>
                    <p className="mt-1 font-semibold text-sm">{t.subject}</p>
                    <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                      {t.userId?.name || 'Learner'} · {t.category}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-7 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6">
          {!activeTicket ? (
            <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
              Select a ticket from the queue to inspect details and reply.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-3">
                <div>
                  <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                    {activeTicket.referenceNumber} · {activeTicket.userId?.email}
                  </p>
                  <h2 className="text-lg font-bold">{activeTicket.subject}</h2>
                </div>
                <select
                  value={activeTicket.status}
                  onChange={(e) => changeStatus(e.target.value)}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-1.5 text-xs"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Answered">Answered</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>

              <div className="space-y-3 max-h-80 overflow-y-auto">
                {messages.map((m) => (
                  <div
                    key={m._id}
                    className={`p-3 rounded-lg text-sm ${
                      m.senderRole === 'admin'
                        ? 'bg-[#176BFF]/10 border border-[#176BFF]/30'
                        : 'bg-[#F6F8FC] dark:bg-[#03051B] border border-[#DCE3F2] dark:border-[#1A2550]'
                    }`}
                  >
                    <p className="text-xs font-semibold text-[#4A5578] dark:text-[#AEB8D4] mb-1">
                      {m.senderName} ({m.senderRole})
                    </p>
                    <p className="whitespace-pre-line">{m.message}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={sendReply} noValidate className="space-y-1.5">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={reply}
                    onChange={(e) => {
                      setReply(e.target.value);
                      setReplyError('');
                    }}
                    placeholder="Write your official support response..."
                    aria-invalid={Boolean(replyError)}
                    className={fieldBorderClass(
                      'flex-1 min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      replyError
                    )}
                  />
                  <button
                    type="submit"
                    disabled={sendingReply}
                    className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
                <FieldError message={replyError} />
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
