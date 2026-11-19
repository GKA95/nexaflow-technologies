import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  Globe,
  Image as ImageIcon,
  Plus,
  RotateCcw,
  Share2,
  Sparkles,
  Tag,
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldError } from '../../components/FieldError';
import { useApp } from '../../context/AppContext';
import type { SEOPageItem, SiteSettings } from '../../types';
import { apiFetch } from '../../utils/authSession';
import {
  fieldBorderClass,
  type FieldErrors,
  seoPageUpdateSchema,
  siteSettingsWriteSchema,
  validateWithSchema,
} from '../../utils/formValidation';

const PRESET_OG_IMAGES = [
  { label: 'Default OG Card', path: '/og-image.png' },
  { label: 'Hero Architecture', path: '/assets/images/hero_nexaflow_architecture.jpg' },
  { label: 'AI Automation', path: '/assets/images/service_ai_automation.jpg' },
  { label: 'Data Analytics', path: '/assets/images/service_data_analytics.jpg' },
  { label: 'GridMind AI', path: '/assets/images/product_gridmind_ai.jpg' },
  { label: 'Brand Banner', path: '/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png' },
];

const PAGE_LABELS: Record<string, string> = {
  home: 'Home (/)',
  about: 'About (/about)',
  solutions: 'Solutions (/solutions)',
  products: 'Products (/products)',
  learn: 'Courses (/learn)',
  insights: 'Insights (/insights)',
  contact: 'Contact (/contact)',
};

function CharMeter({
  value,
  min,
  max,
  label,
}: {
  value: string;
  min: number;
  max: number;
  label: string;
}) {
  const len = value.trim().length;
  const status =
    len === 0
      ? 'text-[#4A5578] dark:text-[#AEB8D4]'
      : len >= min && len <= max
        ? 'text-emerald-600 dark:text-emerald-400'
        : len > max
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-[#176BFF] dark:text-[#00D4FF]';

  return (
    <span className={`text-[11px] font-mono tabular-nums ${status}`}>
      {label}: {len}/{max} chars {len > 0 && len >= min && len <= max ? '(Optimal)' : ''}
    </span>
  );
}

export function AdminSeoSettingsModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingPage, setSavingPage] = useState(false);

  const [globalForm, setGlobalForm] = useState<Partial<SiteSettings>>({
    businessName: 'NexaFlow Technologies',
    seoSiteTitle: 'NexaFlow Technologies | AI, Data & Digital Solutions',
    seoTitleSuffix: 'NexaFlow Technologies',
    seoDefaultDescription:
      'NexaFlow Technologies delivers AI automation, custom web development, data analytics, applied machine learning, and practical online training.',
    seoDefaultKeywords:
      'AI automation, web development, data analytics, machine learning, NexaFlow Technologies',
    seoOgTitle: 'NexaFlow Technologies | AI, Data & Digital Solutions',
    seoOgDescription:
      'Intelligent systems, reliable data, and practical digital engineering powered by NexaFlow Technologies.',
    seoOgImage: '/og-image.png',
    seoTwitterCard: 'summary_large_image',
    seoTwitterSite: '',
    seoCanonicalBaseUrl: '',
    seoRobotsDefault: 'index, follow',
    seoStructuredDataEnabled: true,
  });

  const [seoPages, setSeoPages] = useState<SEOPageItem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('home');
  const [newPageKey, setNewPageKey] = useState('');
  const [globalImgError, setGlobalImgError] = useState(false);
  const [pageImgError, setPageImgError] = useState(false);
  const [confirmResetKey, setConfirmResetKey] = useState<string | null>(null);
  const [globalErrors, setGlobalErrors] = useState<FieldErrors>({});
  const [pageErrors, setPageErrors] = useState<FieldErrors>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, seoRes] = await Promise.all([
        apiFetch('/api/admin/settings', { credentials: 'include' }),
        apiFetch('/api/admin/seo', { credentials: 'include' }),
      ]);
      if (settingsRes.ok) {
        const s = (await settingsRes.json()).settings as SiteSettings | null;
        if (s) {
          setGlobalForm((prev) => ({
            ...prev,
            businessName: s.businessName || prev.businessName,
            seoSiteTitle: s.seoSiteTitle ?? prev.seoSiteTitle,
            seoTitleSuffix: s.seoTitleSuffix ?? s.businessName ?? prev.seoTitleSuffix,
            seoDefaultDescription: s.seoDefaultDescription ?? prev.seoDefaultDescription,
            seoDefaultKeywords: s.seoDefaultKeywords ?? prev.seoDefaultKeywords,
            seoOgTitle: s.seoOgTitle ?? prev.seoOgTitle,
            seoOgDescription: s.seoOgDescription ?? prev.seoOgDescription,
            seoOgImage: s.seoOgImage || '/og-image.png',
            seoTwitterCard: s.seoTwitterCard || 'summary_large_image',
            seoTwitterSite: s.seoTwitterSite || '',
            seoCanonicalBaseUrl: s.seoCanonicalBaseUrl || '',
            seoRobotsDefault: s.seoRobotsDefault || 'index, follow',
            seoStructuredDataEnabled: s.seoStructuredDataEnabled !== false,
          }));
        }
      }
      if (seoRes.ok) {
        const pages = ((await seoRes.json()).seoPages || []) as SEOPageItem[];
        setSeoPages(pages);
        if (pages.length > 0 && !pages.some((p) => p.pageKey === selectedKey)) {
          setSelectedKey(pages[0].pageKey);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedKey]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const activePage = useMemo(
    () => seoPages.find((p) => p.pageKey === selectedKey) || null,
    [seoPages, selectedKey]
  );

  const updateActivePageField = <K extends keyof SEOPageItem>(
    field: K,
    value: SEOPageItem[K]
  ) => {
    setSeoPages((prev) =>
      prev.map((p) => (p.pageKey === selectedKey ? { ...p, [field]: value } : p))
    );
  };

  const handleSaveGlobal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingGlobal) return;
    const candidate = {
      seoSiteTitle: (globalForm.seoSiteTitle || '').trim(),
      seoTitleSuffix: (globalForm.seoTitleSuffix || '').trim(),
      seoDefaultDescription: (globalForm.seoDefaultDescription || '').trim(),
      seoDefaultKeywords: (globalForm.seoDefaultKeywords || '').trim(),
      seoOgTitle: (globalForm.seoOgTitle || '').trim(),
      seoOgDescription: (globalForm.seoOgDescription || '').trim(),
      seoOgImage: (globalForm.seoOgImage || '').trim() || '/og-image.png',
      seoTwitterCard: globalForm.seoTwitterCard || 'summary_large_image',
      seoTwitterSite: (globalForm.seoTwitterSite || '').trim(),
      seoCanonicalBaseUrl: (globalForm.seoCanonicalBaseUrl || '').trim().replace(/\/+$/, ''),
      seoRobotsDefault: globalForm.seoRobotsDefault || 'index, follow',
      seoStructuredDataEnabled: globalForm.seoStructuredDataEnabled !== false,
    };
    const check = validateWithSchema(siteSettingsWriteSchema, candidate);
    if (!check.ok) {
      setGlobalErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setGlobalErrors({});
    setSavingGlobal(true);
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      if (res.ok) {
        await refreshBootstrap();
        showToast('Global SEO settings & social preview defaults saved to MongoDB.', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        if (err.fieldErrors) setGlobalErrors(err.fieldErrors);
        showToast(err.error || 'Failed to save global SEO settings.', 'error');
      }
    } finally {
      setSavingGlobal(false);
    }
  };

  const handleSavePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePage || savingPage) return;
    const check = validateWithSchema(seoPageUpdateSchema, {
      title: activePage.title || '',
      description: activePage.description || '',
      canonicalUrl: activePage.canonicalUrl || '',
      ogTitle: activePage.ogTitle || '',
      ogDescription: activePage.ogDescription || '',
      ogImage: activePage.ogImage || '',
      focusKeyword: activePage.focusKeyword || '',
      noIndex: Boolean(activePage.noIndex),
    });
    if (!check.ok) {
      setPageErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setPageErrors({});
    setSavingPage(true);
    try {
      const res = await apiFetch(`/api/admin/seo/${encodeURIComponent(activePage.pageKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      if (res.ok) {
        await refreshBootstrap();
        showToast(
          `Meta-tags & social preview saved for "${activePage.pageKey}" in MongoDB.`,
          'success'
        );
      } else {
        const err = await res.json().catch(() => ({}));
        if (err.fieldErrors) setPageErrors(err.fieldErrors);
        showToast(err.error || 'Failed to update page SEO settings.', 'error');
      }
    } finally {
      setSavingPage(false);
    }
  };

  const handleAddCustomPage = () => {
    const cleaned = newPageKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!cleaned) {
      showToast('Enter a valid page key (letters, numbers, hyphens).', 'error');
      return;
    }
    if (seoPages.some((p) => p.pageKey === cleaned)) {
      setSelectedKey(cleaned);
      setNewPageKey('');
      return;
    }
    const created: SEOPageItem = {
      pageKey: cleaned,
      title: '',
      description: '',
      canonicalUrl: '',
      ogTitle: '',
      ogDescription: '',
      ogImage: '',
      focusKeyword: '',
      noIndex: false,
    };
    setSeoPages((prev) => [...prev, created]);
    setSelectedKey(cleaned);
    setNewPageKey('');
  };

  const handleResetPageOverride = async (pageKey: string) => {
    const res = await apiFetch(`/api/admin/seo/${encodeURIComponent(pageKey)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      await loadAll();
      await refreshBootstrap();
      showToast(`Reset "${pageKey}" overrides to defaults.`, 'info');
    } else {
      showToast('Could not reset page SEO override.', 'error');
    }
    setConfirmResetKey(null);
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://nexaflowtech.com';
  const previewDomain = (globalForm.seoCanonicalBaseUrl || origin).replace(/^https?:\/\//i, '');
  const resolvedGlobalImg = globalForm.seoOgImage?.trim() || '/og-image.png';
  const resolvedPageImg = activePage?.ogImage?.trim() || resolvedGlobalImg;
  const previewPageTitle =
    activePage?.ogTitle?.trim() ||
    activePage?.title?.trim() ||
    globalForm.seoOgTitle?.trim() ||
    globalForm.seoSiteTitle?.trim() ||
    'NexaFlow Technologies';
  const previewPageDesc =
    activePage?.ogDescription?.trim() ||
    activePage?.description?.trim() ||
    globalForm.seoOgDescription?.trim() ||
    globalForm.seoDefaultDescription?.trim() ||
    '';

  if (loading) {
    return (
      <div className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading SEO settings from MongoDB...
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-[#00D4FF]" />
            <span>SEO Settings &amp; Dynamic Meta-Tag Manager</span>
          </h1>
          <p className="mt-1 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Manage global fallback meta-tags, site descriptions, social preview images, and per-page
            OpenGraph / X cards stored in MongoDB. Changes update the live dynamic meta-tag manager
            immediately.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-1.5 text-[#176BFF] dark:text-[#00D4FF] hover:border-[#176BFF]"
          >
            /sitemap.xml
          </a>
          <a
            href="/robots.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-1.5 text-[#176BFF] dark:text-[#00D4FF] hover:border-[#176BFF]"
          >
            /robots.txt
          </a>
        </div>
      </div>

      {/* Section 1 & 2: Global Meta-Tags, Site Descriptions & Social Preview Images */}
      <form onSubmit={handleSaveGlobal} noValidate className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          {/* Global Meta-Tags & Descriptions */}
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-3">
              <Globe className="w-4 h-4 text-[#00D4FF]" />
              <h2 className="text-base font-bold">Global Meta-Tags &amp; Site Descriptions</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">Default Site Title</label>
                  <CharMeter value={globalForm.seoSiteTitle || ''} min={30} max={60} label="Title" />
                </div>
                <input
                  value={globalForm.seoSiteTitle || ''}
                  onChange={(e) => {
                    setGlobalForm({ ...globalForm, seoSiteTitle: e.target.value });
                    setGlobalErrors((p) => ({ ...p, seoSiteTitle: '' }));
                  }}
                  placeholder="NexaFlow Technologies | AI, Data & Digital Solutions"
                  aria-invalid={Boolean(globalErrors.seoSiteTitle)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    globalErrors.seoSiteTitle
                  )}
                />
                <FieldError message={globalErrors.seoSiteTitle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Title Suffix (Sub-pages &amp; Detail Pages)
                </label>
                <input
                  value={globalForm.seoTitleSuffix || ''}
                  onChange={(e) => {
                    setGlobalForm({ ...globalForm, seoTitleSuffix: e.target.value });
                    setGlobalErrors((p) => ({ ...p, seoTitleSuffix: '' }));
                  }}
                  placeholder="NexaFlow Technologies"
                  aria-invalid={Boolean(globalErrors.seoTitleSuffix)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    globalErrors.seoTitleSuffix
                  )}
                />
                <FieldError message={globalErrors.seoTitleSuffix} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium">
                  Global Site Meta Description (Fallback when page description is blank)
                </label>
                <CharMeter
                  value={globalForm.seoDefaultDescription || ''}
                  min={120}
                  max={160}
                  label="Desc"
                />
              </div>
              <textarea
                rows={3}
                value={globalForm.seoDefaultDescription || ''}
                onChange={(e) => {
                  setGlobalForm({ ...globalForm, seoDefaultDescription: e.target.value });
                  setGlobalErrors((p) => ({ ...p, seoDefaultDescription: '' }));
                }}
                placeholder="Summarize NexaFlow Technologies in 120–160 characters..."
                aria-invalid={Boolean(globalErrors.seoDefaultDescription)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  globalErrors.seoDefaultDescription
                )}
              />
              <FieldError message={globalErrors.seoDefaultDescription} />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Global Meta Keywords (comma-separated fallback)
              </label>
              <input
                value={globalForm.seoDefaultKeywords || ''}
                onChange={(e) => {
                  setGlobalForm({ ...globalForm, seoDefaultKeywords: e.target.value });
                  setGlobalErrors((p) => ({ ...p, seoDefaultKeywords: '' }));
                }}
                placeholder="AI automation, web development, data analytics, machine learning"
                aria-invalid={Boolean(globalErrors.seoDefaultKeywords)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  globalErrors.seoDefaultKeywords
                )}
              />
              <FieldError message={globalErrors.seoDefaultKeywords} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Canonical Base URL (Optional Domain Override)
                </label>
                <input
                  type="url"
                  value={globalForm.seoCanonicalBaseUrl || ''}
                  onChange={(e) => {
                    setGlobalForm({ ...globalForm, seoCanonicalBaseUrl: e.target.value });
                    setGlobalErrors((p) => ({ ...p, seoCanonicalBaseUrl: '' }));
                  }}
                  placeholder="https://nexaflowtech.com"
                  aria-invalid={Boolean(globalErrors.seoCanonicalBaseUrl)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                    globalErrors.seoCanonicalBaseUrl
                  )}
                />
                <FieldError message={globalErrors.seoCanonicalBaseUrl} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Default Search Indexing</label>
                <select
                  value={globalForm.seoRobotsDefault || 'index, follow'}
                  onChange={(e) =>
                    setGlobalForm({
                      ...globalForm,
                      seoRobotsDefault: e.target.value as 'index, follow' | 'noindex, nofollow',
                    })
                  }
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                >
                  <option value="index, follow">index, follow (Public Search Indexed)</option>
                  <option value="noindex, nofollow">noindex, nofollow (Hide Site Globally)</option>
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2.5 text-xs font-medium cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={globalForm.seoStructuredDataEnabled !== false}
                onChange={(e) =>
                  setGlobalForm({ ...globalForm, seoStructuredDataEnabled: e.target.checked })
                }
                className="rounded border-[#DCE3F2] dark:border-[#1A2550]"
              />
              <span>Emit Schema.org JSON-LD Structured Data on public pages</span>
            </label>
          </div>

          {/* Global Social Preview & OpenGraph / X Cards */}
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-3">
              <Share2 className="w-4 h-4 text-[#00D4FF]" />
              <h2 className="text-base font-bold">
                Global Social Preview Image &amp; OpenGraph / X Card
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Global OG / Social Title</label>
                <input
                  value={globalForm.seoOgTitle || ''}
                  onChange={(e) => {
                    setGlobalForm({ ...globalForm, seoOgTitle: e.target.value });
                    setGlobalErrors((p) => ({ ...p, seoOgTitle: '' }));
                  }}
                  placeholder="Defaults to page SEO title if blank"
                  aria-invalid={Boolean(globalErrors.seoOgTitle)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    globalErrors.seoOgTitle
                  )}
                />
                <FieldError message={globalErrors.seoOgTitle} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">X / Twitter Handle</label>
                <input
                  value={globalForm.seoTwitterSite || ''}
                  onChange={(e) => {
                    setGlobalForm({ ...globalForm, seoTwitterSite: e.target.value });
                    setGlobalErrors((p) => ({ ...p, seoTwitterSite: '' }));
                  }}
                  placeholder="@nexaflowtech"
                  aria-invalid={Boolean(globalErrors.seoTwitterSite)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                    globalErrors.seoTwitterSite
                  )}
                />
                <FieldError message={globalErrors.seoTwitterSite} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">
                Global OG / Social Description
              </label>
              <textarea
                rows={2}
                value={globalForm.seoOgDescription || ''}
                onChange={(e) => {
                  setGlobalForm({ ...globalForm, seoOgDescription: e.target.value });
                  setGlobalErrors((p) => ({ ...p, seoOgDescription: '' }));
                }}
                placeholder="Defaults to page/site meta description if blank"
                aria-invalid={Boolean(globalErrors.seoOgDescription)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  globalErrors.seoOgDescription
                )}
              />
              <FieldError message={globalErrors.seoOgDescription} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium mb-1">
                  Global Social Preview Image URL or Asset Path
                </label>
                <input
                  value={globalForm.seoOgImage || ''}
                  onChange={(e) => {
                    setGlobalImgError(false);
                    setGlobalForm({ ...globalForm, seoOgImage: e.target.value });
                    setGlobalErrors((p) => ({ ...p, seoOgImage: '' }));
                  }}
                  placeholder="/og-image.png or https://..."
                  aria-invalid={Boolean(globalErrors.seoOgImage)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                    globalErrors.seoOgImage
                  )}
                />
                <FieldError message={globalErrors.seoOgImage} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">X / Twitter Card Style</label>
                <select
                  value={globalForm.seoTwitterCard || 'summary_large_image'}
                  onChange={(e) =>
                    setGlobalForm({
                      ...globalForm,
                      seoTwitterCard: e.target.value as 'summary_large_image' | 'summary',
                    })
                  }
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                >
                  <option value="summary_large_image">Large Preview Image</option>
                  <option value="summary">Compact Summary Card</option>
                </select>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-2">
                Quick-pick hosted NexaFlow social preview image:
              </p>
              <div className="flex flex-wrap gap-2">
                {PRESET_OG_IMAGES.map((preset) => {
                  const selected = globalForm.seoOgImage === preset.path;
                  return (
                    <button
                      key={preset.path}
                      type="button"
                      onClick={() => {
                        setGlobalImgError(false);
                        setGlobalForm({ ...globalForm, seoOgImage: preset.path });
                        setGlobalErrors((p) => ({ ...p, seoOgImage: '' }));
                      }}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'border-[#00D4FF] bg-[#176BFF]/15 text-[#176BFF] dark:text-[#00D4FF]'
                          : 'border-[#DCE3F2] dark:border-[#1A2550] hover:border-[#176BFF]'
                      }`}
                    >
                      <ImageIcon className="w-3 h-3" />
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingGlobal}
                className="inline-flex items-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white"
              >
                <CheckCircle2 className="w-4 h-4" />
                {savingGlobal ? 'Saving Global SEO...' : 'Save Global SEO Settings'}
              </button>
            </div>
          </div>
        </div>

        {/* Live Global Preview Column */}
        <div className="space-y-6">
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-[#00D4FF]">
              <Eye className="w-4 h-4" />
              <span>Global Social Card Preview</span>
            </div>

            <div className="rounded-xl overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B]">
              <div className="aspect-[1200/630] w-full bg-[#03051B] flex items-center justify-center overflow-hidden relative">
                {!globalImgError ? (
                  <img
                    src={resolvedGlobalImg}
                    alt="Global social preview"
                    onError={() => setGlobalImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="p-4 text-center text-xs text-amber-300">
                    Could not load preview image at <code>{resolvedGlobalImg}</code>. Verify URL or
                    choose a preset asset.
                  </div>
                )}
              </div>
              <div className="p-3.5 space-y-1">
                <p className="text-[11px] font-mono uppercase text-[#4A5578] dark:text-[#AEB8D4] truncate">
                  {previewDomain}
                </p>
                <p className="text-sm font-bold line-clamp-1">
                  {globalForm.seoOgTitle?.trim() || globalForm.seoSiteTitle || 'NexaFlow Technologies'}
                </p>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] line-clamp-2">
                  {globalForm.seoOgDescription?.trim() ||
                    globalForm.seoDefaultDescription ||
                    'Global fallback social share description.'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-3.5 space-y-1">
              <p className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                Search Snippet Preview
              </p>
              <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] truncate">{origin}/</p>
              <p className="text-sm font-semibold text-[#176BFF] dark:text-[#66B2FF] line-clamp-1">
                {globalForm.seoSiteTitle || 'NexaFlow Technologies'}
              </p>
              <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] line-clamp-2">
                {globalForm.seoDefaultDescription}
              </p>
            </div>
          </div>
        </div>
      </form>

      {/* Section 3: Per-Page Meta-Tags & Social Preview Images */}
      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-4">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#00D4FF]" />
            <div>
              <h2 className="text-base font-bold">
                Per-Page Meta-Tags &amp; Social Preview Overrides
              </h2>
              <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                Leave any field blank on a page to inherit the global MongoDB SEO defaults above.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <input
              value={newPageKey}
              onChange={(e) => setNewPageKey(e.target.value)}
              placeholder="Custom page key..."
              className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs font-mono"
            />
            <button
              type="button"
              onClick={handleAddCustomPage}
              className="min-h-[44px] inline-flex items-center justify-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-2 text-xs font-semibold hover:border-[#176BFF] shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Page Key
            </button>
          </div>
        </div>

        {/* Route Key Selector */}
        <div className="flex flex-wrap gap-2">
          {seoPages.map((page) => {
            const isActive = page.pageKey === selectedKey;
            return (
              <button
                key={page.pageKey}
                type="button"
                onClick={() => {
                  setPageImgError(false);
                  setPageErrors({});
                  setSelectedKey(page.pageKey);
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-[#176BFF] border-[#176BFF] text-white'
                    : 'border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] text-[#4A5578] dark:text-[#AEB8D4] hover:border-[#176BFF]'
                }`}
              >
                {PAGE_LABELS[page.pageKey] || `/${page.pageKey}`}
              </button>
            );
          })}
        </div>

        {activePage && (
          <form onSubmit={handleSavePage} noValidate className="grid grid-cols-1 xl:grid-cols-3 gap-6 pt-2">
            <div className="xl:col-span-2 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium">Page SEO Title</label>
                    <CharMeter value={activePage.title || ''} min={30} max={60} label="Title" />
                  </div>
                  <input
                    value={activePage.title || ''}
                    onChange={(e) => {
                      updateActivePageField('title', e.target.value);
                      setPageErrors((p) => ({ ...p, title: '' }));
                    }}
                    placeholder={globalForm.seoSiteTitle || 'Inherits global title'}
                    aria-invalid={Boolean(pageErrors.title)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      pageErrors.title
                    )}
                  />
                  <FieldError message={pageErrors.title} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Focus Keyword / Page Keywords
                  </label>
                  <input
                    value={activePage.focusKeyword || ''}
                    onChange={(e) => {
                      updateActivePageField('focusKeyword', e.target.value);
                      setPageErrors((p) => ({ ...p, focusKeyword: '' }));
                    }}
                    placeholder="Inherits global keywords if blank"
                    aria-invalid={Boolean(pageErrors.focusKeyword)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      pageErrors.focusKeyword
                    )}
                  />
                  <FieldError message={pageErrors.focusKeyword} />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">Page Meta Description</label>
                  <CharMeter
                    value={activePage.description || ''}
                    min={120}
                    max={160}
                    label="Desc"
                  />
                </div>
                <textarea
                  rows={2}
                  value={activePage.description || ''}
                  onChange={(e) => {
                    updateActivePageField('description', e.target.value);
                    setPageErrors((p) => ({ ...p, description: '' }));
                  }}
                  placeholder="Inherits global site description if left blank"
                  aria-invalid={Boolean(pageErrors.description)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    pageErrors.description
                  )}
                />
                <FieldError message={pageErrors.description} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Social Preview Title (og:title)
                  </label>
                  <input
                    value={activePage.ogTitle || ''}
                    onChange={(e) => {
                      updateActivePageField('ogTitle', e.target.value);
                      setPageErrors((p) => ({ ...p, ogTitle: '' }));
                    }}
                    placeholder="Inherits Page Title or Global OG Title"
                    aria-invalid={Boolean(pageErrors.ogTitle)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      pageErrors.ogTitle
                    )}
                  />
                  <FieldError message={pageErrors.ogTitle} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Canonical URL Override (Optional)
                  </label>
                  <input
                    value={activePage.canonicalUrl || ''}
                    onChange={(e) => {
                      updateActivePageField('canonicalUrl', e.target.value);
                      setPageErrors((p) => ({ ...p, canonicalUrl: '' }));
                    }}
                    placeholder={`${origin}${activePage.pageKey === 'home' ? '/' : `/${activePage.pageKey}`}`}
                    aria-invalid={Boolean(pageErrors.canonicalUrl)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                      pageErrors.canonicalUrl
                    )}
                  />
                  <FieldError message={pageErrors.canonicalUrl} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Social Preview Description (og:description)
                </label>
                <textarea
                  rows={2}
                  value={activePage.ogDescription || ''}
                  onChange={(e) => {
                    updateActivePageField('ogDescription', e.target.value);
                    setPageErrors((p) => ({ ...p, ogDescription: '' }));
                  }}
                  placeholder="Inherits Page Description or Global OG Description"
                  aria-invalid={Boolean(pageErrors.ogDescription)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    pageErrors.ogDescription
                  )}
                />
                <FieldError message={pageErrors.ogDescription} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium">
                    Page Social Preview Image URL / Path (og:image)
                  </label>
                  {activePage.ogImage && (
                    <button
                      type="button"
                      onClick={() => {
                        setPageImgError(false);
                        updateActivePageField('ogImage', '');
                        setPageErrors((p) => ({ ...p, ogImage: '' }));
                      }}
                      className="text-[11px] text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                    >
                      Use Global Image
                    </button>
                  )}
                </div>
                <input
                  value={activePage.ogImage || ''}
                  onChange={(e) => {
                    setPageImgError(false);
                    updateActivePageField('ogImage', e.target.value);
                    setPageErrors((p) => ({ ...p, ogImage: '' }));
                  }}
                  placeholder={`Inherits Global (${resolvedGlobalImg})`}
                  aria-invalid={Boolean(pageErrors.ogImage)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono',
                    pageErrors.ogImage
                  )}
                />
                <FieldError message={pageErrors.ogImage} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PRESET_OG_IMAGES.map((preset) => (
                    <button
                      key={preset.path}
                      type="button"
                      onClick={() => {
                        setPageImgError(false);
                        updateActivePageField('ogImage', preset.path);
                        setPageErrors((p) => ({ ...p, ogImage: '' }));
                      }}
                      className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                        activePage.ogImage === preset.path
                          ? 'border-[#00D4FF] bg-[#176BFF]/15 text-[#176BFF] dark:text-[#00D4FF]'
                          : 'border-[#DCE3F2] dark:border-[#1A2550] hover:border-[#176BFF]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={Boolean(activePage.noIndex)}
                  onChange={(e) => updateActivePageField('noIndex', e.target.checked)}
                />
                <span>
                  Set <code className="font-mono">noindex, nofollow</code> on this page (also
                  excludes from sitemap.xml)
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingPage}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {savingPage ? 'Saving Page...' : `Save "${activePage.pageKey}" Meta-Tags`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetKey(activePage.pageKey)}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2.5 text-xs font-semibold hover:border-red-400 hover:text-red-400"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Page Override
                </button>
              </div>
            </div>

            {/* Live Page Social Card Preview */}
            <div className="space-y-3">
              <p className="text-xs font-mono uppercase tracking-wider text-[#00D4FF]">
                Page Preview: {activePage.pageKey}
              </p>
              <div className="rounded-xl overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B]">
                <div className="aspect-[1200/630] w-full bg-[#03051B] flex items-center justify-center overflow-hidden">
                  {!pageImgError ? (
                    <img
                      src={resolvedPageImg}
                      alt={`Social preview for ${activePage.pageKey}`}
                      onError={() => setPageImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="p-4 text-center text-xs text-amber-300">
                      Preview image failed to load: <code>{resolvedPageImg}</code>
                    </div>
                  )}
                </div>
                <div className="p-3.5 space-y-1">
                  <p className="text-[11px] font-mono uppercase text-[#4A5578] dark:text-[#AEB8D4] truncate">
                    {previewDomain}
                    {activePage.pageKey === 'home' ? '/' : `/${activePage.pageKey}`}
                  </p>
                  <p className="text-sm font-bold line-clamp-1">{previewPageTitle}</p>
                  <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] line-clamp-2">
                    {previewPageDesc}
                  </p>
                  <p className="pt-1 text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                    Robots: {activePage.noIndex ? 'noindex, nofollow' : globalForm.seoRobotsDefault}
                  </p>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmResetKey)}
        title="Reset Page SEO Override?"
        message={`This removes custom MongoDB SEO overrides for "${confirmResetKey}" so it falls back to defaults. Continue?`}
        confirmLabel="Reset Override"
        onConfirm={() => {
          if (confirmResetKey) handleResetPageOverride(confirmResetKey);
        }}
        onCancel={() => setConfirmResetKey(null)}
      />
    </div>
  );
}
