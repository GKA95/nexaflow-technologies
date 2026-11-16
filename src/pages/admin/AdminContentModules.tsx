import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Eye, EyeOff, Plus, Send, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useApp } from '../../context/AppContext';
import type { ArticleItem, ProductItem, ServiceItem, SupportTicketItem } from '../../types';
import { apiFetch } from '../../utils/authSession';

export function AdminProductsModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [editing, setEditing] = useState<Partial<ProductItem> | null>(null);
  const [delTarget, setDelTarget] = useState<ProductItem | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/products', { credentials: 'include' });
    if (res.ok) setProducts((await res.json()).products || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const isNew = !editing._id;
    const res = await apiFetch(isNew ? '/api/admin/products' : `/api/admin/products/${editing._id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      showToast('Product saved.', 'success');
      setEditing(null);
      load();
      refreshBootstrap();
    } else {
      showToast('Failed to save product.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Product Management</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Manage GridMind AI and additional software products.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Product
        </button>
      </div>

      {editing && (
        <form
          onSubmit={save}
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              required
              placeholder="Product Name *"
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              placeholder="Category"
              value={editing.category || ''}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              placeholder="Pricing / Availability Status"
              value={editing.pricingStatus || ''}
              onChange={(e) => setEditing({ ...editing, pricingStatus: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              placeholder="Demo URL (optional)"
              value={editing.demoLink || ''}
              onChange={(e) => setEditing({ ...editing, demoLink: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              placeholder="Image URL"
              value={editing.images?.[0] || ''}
              onChange={(e) => setEditing({ ...editing, images: e.target.value ? [e.target.value] : [] })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            required
            placeholder="Short Description *"
            value={editing.shortDescription || ''}
            onChange={(e) => setEditing({ ...editing, shortDescription: e.target.value })}
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
          />
          <textarea
            rows={3}
            placeholder="Full Description"
            value={editing.fullDescription || ''}
            onChange={(e) => setEditing({ ...editing, fullDescription: e.target.value })}
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <textarea
              rows={3}
              placeholder="Features (one per line)"
              value={(editing.features || []).join('\n')}
              onChange={(e) =>
                setEditing({ ...editing, features: e.target.value.split('\n').filter(Boolean) })
              }
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              placeholder="Benefits (one per line)"
              value={(editing.benefits || []).join('\n')}
              onChange={(e) =>
                setEditing({ ...editing, benefits: e.target.value.split('\n').filter(Boolean) })
              }
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editing.published)}
              onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
            />
            Published
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white">
              Save Product
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
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
                onClick={() => setEditing(p)}
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
    </div>
  );
}

export function AdminServicesModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [editing, setEditing] = useState<Partial<ServiceItem> | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/services', { credentials: 'include' });
    if (res.ok) setServices((await res.json()).services || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const isNew = !editing._id;
    const res = await apiFetch(isNew ? '/api/admin/services' : `/api/admin/services/${editing._id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      showToast('Service saved.', 'success');
      setEditing(null);
      load();
      refreshBootstrap();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Service Pages Manager</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Add, edit, reorder, publish, and unpublish solution landing pages.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Service
        </button>
      </div>

      {editing && (
        <form
          onSubmit={save}
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <input
              required
              placeholder="Service Name *"
              value={editing.name || ''}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              type="number"
              placeholder="Order"
              value={editing.order ?? 1}
              onChange={(e) => setEditing({ ...editing, order: Number(e.target.value) })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              placeholder="CTA Button Label"
              value={editing.ctaLabel || ''}
              onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            required
            placeholder="Short Description *"
            value={editing.shortDescription || ''}
            onChange={(e) => setEditing({ ...editing, shortDescription: e.target.value })}
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
          />
          <textarea
            rows={3}
            placeholder="Detailed Overview"
            value={editing.overview || ''}
            onChange={(e) => setEditing({ ...editing, overview: e.target.value })}
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <textarea
              rows={3}
              placeholder="Problems Addressed (one per line)"
              value={(editing.problemsAddressed || []).join('\n')}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  problemsAddressed: e.target.value.split('\n').filter(Boolean),
                })
              }
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              placeholder="Deliverables (one per line)"
              value={(editing.deliverables || []).join('\n')}
              onChange={(e) =>
                setEditing({
                  ...editing,
                  deliverables: e.target.value.split('\n').filter(Boolean),
                })
              }
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editing.published)}
              onChange={(e) => setEditing({ ...editing, published: e.target.checked })}
            />
            Published
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white">
              Save Service
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
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
                onClick={() => setEditing(s)}
                className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs"
              >
                <Edit2 className="w-3.5 h-3.5" /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminBlogModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [editing, setEditing] = useState<Partial<ArticleItem> | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/articles', { credentials: 'include' });
    if (res.ok) setArticles((await res.json()).articles || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const isNew = !editing._id;
    const res = await apiFetch(isNew ? '/api/admin/articles' : `/api/admin/articles/${editing._id}`, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      showToast('Article saved.', 'success');
      setEditing(null);
      setPreviewMode(false);
      load();
      refreshBootstrap();
    } else {
      const d = await res.json();
      showToast(d.error || 'Error saving article.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">NexaFlow Insights CMS</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Write, preview, draft, publish, and manage SEO metadata for blog articles.
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setEditing({
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
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Article
        </button>
      </div>

      {editing && (
        <form
          onSubmit={save}
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{editing._id ? 'Edit Article' : 'New Article'}</h2>
            <button
              type="button"
              onClick={() => setPreviewMode((p) => !p)}
              className="text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF]"
            >
              {previewMode ? 'Back to Editor' : 'Preview Layout'}
            </button>
          </div>

          {previewMode ? (
            <div className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] p-6 space-y-4">
              <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                {editing.category} · By {editing.authorName}
              </p>
              <h3 className="text-2xl font-bold">{editing.title}</h3>
              <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">{editing.excerpt}</p>
              <div className="whitespace-pre-line text-sm leading-relaxed">{editing.content}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  required
                  placeholder="Article Title *"
                  value={editing.title || ''}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <input
                  placeholder="URL Slug (auto if blank)"
                  value={editing.slug || ''}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <input
                  placeholder="Category"
                  value={editing.category || ''}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <input
                  placeholder="Author Display Name"
                  value={editing.authorName || ''}
                  onChange={(e) => setEditing({ ...editing, authorName: e.target.value })}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <select
                  value={editing.status || 'draft'}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value as 'draft' | 'published' })
                  }
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <input
                  placeholder="Featured Image URL"
                  value={editing.featuredImage || ''}
                  onChange={(e) => setEditing({ ...editing, featuredImage: e.target.value })}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>

              <textarea
                rows={2}
                placeholder="Excerpt / Summary"
                value={editing.excerpt || ''}
                onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
              <textarea
                rows={8}
                required
                placeholder="Article Content *"
                value={editing.content || ''}
                onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  placeholder="Tags (comma separated)"
                  value={(editing.tags || []).join(', ')}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tags: e.target.value
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <input
                  placeholder="SEO Title"
                  value={editing.seoTitle || ''}
                  onChange={(e) => setEditing({ ...editing, seoTitle: e.target.value })}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>
              <input
                placeholder="SEO Meta Description"
                value={editing.seoDescription || ''}
                onChange={(e) => setEditing({ ...editing, seoDescription: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </>
          )}

          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white">
              Save Article
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setPreviewMode(false);
              }}
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
                  onClick={() => setEditing(a)}
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

  const load = useCallback(async () => {
    const res = await apiFetch('/api/admin/tickets', { credentials: 'include' });
    if (res.ok) setTickets((await res.json()).tickets || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openTicket = async (t: SupportTicketItem) => {
    setActiveTicket(t);
    const res = await apiFetch(`/api/admin/tickets/${t._id}`, { credentials: 'include' });
    if (res.ok) setMessages((await res.json()).messages || []);
  };

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !reply.trim()) return;
    const res = await apiFetch(`/api/admin/tickets/${activeTicket._id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: reply }),
    });
    if (res.ok) {
      setReply('');
      openTicket(activeTicket);
      load();
      showToast('Reply sent to learner.', 'success');
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

              <form onSubmit={sendReply} className="flex gap-2">
                <input
                  type="text"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write your official support response..."
                  className="flex-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send Reply
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
