import React, { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound, Mail, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { SEOPageItem, SiteSettings } from '../../types';
import { apiFetch } from '../../utils/authSession';

export function AdminSettingsModule({ mode }: { mode: 'business' | 'website' | 'legal' }) {
  const { showToast, refreshBootstrap } = useApp();
  const [form, setForm] = useState<SiteSettings | null>(null);

  useEffect(() => {
    apiFetch('/api/admin/settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setForm(d.settings));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const res = await apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(form),
    });
    if (res.ok) {
      showToast('Settings saved.', 'success');
      refreshBootstrap();
    } else {
      showToast('Failed to update settings.', 'error');
    }
  };

  if (!form) return <div className="text-sm">Loading settings...</div>;

  return (
    <form onSubmit={save} className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">
          {mode === 'business'
            ? 'Business Information & Contacts'
            : mode === 'website'
              ? 'Website Content & Copy'
              : 'Legal & Policy Templates'}
        </h1>
      </div>

      {mode === 'business' && (
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-700 dark:text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Privacy Reminder: NexaFlow Technologies operates online. Only enter a general city/country in General Location—never publish a private residential or workspace street address.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Business Display Name</label>
              <input
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Descriptor</label>
              <input
                value={form.descriptor}
                onChange={(e) => setForm({ ...form, descriptor: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Business Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Business Phone</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">WhatsApp Number (with country code)</label>
              <input
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                placeholder="e.g. 233..."
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">General Location (City / Country only)</label>
              <input
                value={form.generalLocation}
                onChange={(e) => setForm({ ...form, generalLocation: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Service Areas</label>
              <input
                value={form.serviceAreas}
                onChange={(e) => setForm({ ...form, serviceAreas: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Operating Hours</label>
              <input
                value={form.businessHours}
                onChange={(e) => setForm({ ...form, businessHours: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="pt-2 border-t border-[#DCE3F2] dark:border-[#1A2550] grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['linkedin', 'youtube', 'facebook', 'instagram', 'x'] as const).map((net) => (
              <div key={net}>
                <label className="block text-xs font-medium mb-1 capitalize">{net} URL</label>
                <input
                  value={form.socialLinks?.[net] || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      socialLinks: { ...form.socialLinks, [net]: e.target.value },
                    })
                  }
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium mb-1">Google Business Profile URL (if eligible)</label>
              <input
                value={form.googleBusinessProfileUrl || ''}
                onChange={(e) => setForm({ ...form, googleBusinessProfileUrl: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {mode === 'website' && (
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Hero Headline</label>
            <input
              value={form.heroHeadline}
              onChange={(e) => setForm({ ...form, heroHeadline: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Hero Subheadline</label>
            <textarea
              rows={3}
              value={form.heroSubheadline}
              onChange={(e) => setForm({ ...form, heroSubheadline: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">About Introduction</label>
            <textarea
              rows={3}
              value={form.aboutIntro}
              onChange={(e) => setForm({ ...form, aboutIntro: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Mission</label>
              <textarea
                rows={3}
                value={form.mission}
                onChange={(e) => setForm({ ...form, mission: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Vision</label>
              <textarea
                rows={3}
                value={form.vision}
                onChange={(e) => setForm({ ...form, vision: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Values (one per line)</label>
            <textarea
              rows={4}
              value={(form.values || []).join('\n')}
              onChange={(e) =>
                setForm({ ...form, values: e.target.value.split('\n').filter(Boolean) })
              }
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {mode === 'legal' && (
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium mb-1">Privacy Policy</label>
            <textarea
              rows={6}
              value={form.legalPrivacy}
              onChange={(e) => setForm({ ...form, legalPrivacy: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Terms of Service</label>
            <textarea
              rows={6}
              value={form.legalTerms}
              onChange={(e) => setForm({ ...form, legalTerms: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Cookie &amp; Analytics Notice</label>
            <textarea
              rows={4}
              value={form.legalCookies}
              onChange={(e) => setForm({ ...form, legalCookies: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Course &amp; Refund Policy</label>
            <textarea
              rows={4}
              value={form.legalRefund}
              onChange={(e) => setForm({ ...form, legalRefund: e.target.value })}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      <button
        type="submit"
        className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-2.5 text-sm font-semibold text-white"
      >
        Save Changes
      </button>
    </form>
  );
}

export function AdminSeoModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [seoPages, setSeoPages] = useState<SEOPageItem[]>([]);
  const [gaId, setGaId] = useState('');
  const [gscTag, setGscTag] = useState('');

  const load = useCallback(async () => {
    const [seoRes, setRes] = await Promise.all([
      apiFetch('/api/admin/seo', { credentials: 'include' }),
      apiFetch('/api/admin/settings', { credentials: 'include' }),
    ]);
    if (seoRes.ok) setSeoPages((await seoRes.json()).seoPages || []);
    if (setRes.ok) {
      const s = (await setRes.json()).settings;
      if (s) {
        setGaId(s.gaMeasurementId || '');
        setGscTag(s.gscVerificationTag || '');
      }
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const savePage = async (page: SEOPageItem) => {
    const res = await apiFetch(`/api/admin/seo/${encodeURIComponent(page.pageKey)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(page),
    });
    if (res.ok) {
      showToast(`SEO updated for ${page.pageKey}.`, 'success');
      refreshBootstrap();
    }
  };

  const saveAnalyticsTags = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ gaMeasurementId: gaId, gscVerificationTag: gscTag }),
    });
    if (res.ok) {
      showToast('Analytics & Search Console configuration saved.', 'success');
      refreshBootstrap();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SEO, Google Analytics &amp; Search Console</h1>
        <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          Configure page titles, meta descriptions, canonicals, GA4 Measurement ID, and GSC verification.
        </p>
      </div>

      <form
        onSubmit={saveAnalyticsTags}
        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
      >
        <h2 className="text-base font-bold">Google Analytics 4 &amp; Search Console</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">GA4 Measurement ID (e.g. G-XXXXXXXXXX)</label>
            <input
              value={gaId}
              onChange={(e) => setGaId(e.target.value)}
              placeholder="G-..."
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">
              Google Search Console Verification Token
            </label>
            <input
              value={gscTag}
              onChange={(e) => setGscTag(e.target.value)}
              placeholder="Meta tag content token"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm font-mono"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button type="submit" className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white">
            Save Tracking &amp; Verification
          </button>
          <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] space-x-4">
            <a href="/sitemap.xml" target="_blank" rel="noopener noreferrer" className="text-[#00D4FF] underline">
              View /sitemap.xml
            </a>
            <a href="/robots.txt" target="_blank" rel="noopener noreferrer" className="text-[#00D4FF] underline">
              View /robots.txt
            </a>
          </div>
        </div>
      </form>

      <div className="space-y-4">
        {seoPages.map((p, idx) => (
          <div
            key={p.pageKey}
            className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold uppercase text-xs font-mono text-[#00D4FF]">Page: {p.pageKey}</h3>
              <button
                type="button"
                onClick={() => savePage(p)}
                className="rounded-lg bg-[#176BFF] px-3 py-1.5 text-xs font-semibold text-white"
              >
                Save Page SEO
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="SEO Title"
                value={p.title || ''}
                onChange={(e) =>
                  setSeoPages((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, title: e.target.value } : item))
                  )
                }
                className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
              <input
                placeholder="Focus Keyword"
                value={p.focusKeyword || ''}
                onChange={(e) =>
                  setSeoPages((prev) =>
                    prev.map((item, i) =>
                      i === idx ? { ...item, focusKeyword: e.target.value } : item
                    )
                  )
                }
                className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <textarea
              rows={2}
              placeholder="Meta Description"
              value={p.description || ''}
              onChange={(e) =>
                setSeoPages((prev) =>
                  prev.map((item, i) =>
                    i === idx ? { ...item, description: e.target.value } : item
                  )
                )
              }
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminAccountSecurityModule() {
  const { refreshAuth, setAuthenticatedSession, showToast } = useApp();
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [secondaryEmails, setSecondaryEmails] = useState<string[]>([]);
  const [newSecondaryEmail, setNewSecondaryEmail] = useState('');
  const [googleLinked, setGoogleLinked] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingEmails, setSavingEmails] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/profile', { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.profile) {
        setName(data.profile.name || '');
        setEmail(data.profile.email || '');
        setSecondaryEmails(data.profile.secondaryEmails || []);
        setGoogleLinked(Boolean(data.profile.googleLinked));
        setHasPassword(Boolean(data.profile.hasPassword));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const addSecondaryEmail = () => {
    const cleaned = newSecondaryEmail.trim().toLowerCase();
    if (!cleaned || !cleaned.includes('@')) {
      showToast('Enter a valid email address.', 'error');
      return;
    }
    if (cleaned === email.trim().toLowerCase() || secondaryEmails.includes(cleaned)) {
      showToast('That email is already listed.', 'info');
      return;
    }
    setSecondaryEmails((prev) => [...prev, cleaned]);
    setNewSecondaryEmail('');
  };

  const handleSaveEmails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEmails(true);
    try {
      const res = await apiFetch('/api/auth/account-emails', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, email, secondaryEmails }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not update account emails.', 'error');
        return;
      }
      if (data.user) {
        setAuthenticatedSession(
          data.user,
          typeof data.sessionToken === 'string' ? data.sessionToken : undefined
        );
      }
      await refreshAuth();
      showToast('Administrator name & login emails saved in MongoDB.', 'success');
      loadProfile();
    } finally {
      setSavingEmails(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 10) {
      showToast('Administrator password must be at least 10 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match.', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      const res = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not update password.', 'error');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setHasPassword(true);
      showToast('Password updated in MongoDB.', 'success');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-[#AEB8D4]">Loading account security settings...</div>;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">My Administrator Emails &amp; Password</h1>
        <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          Configure the email addresses you use for password sign-in, Google Sign-In, and password recovery. All credentials are stored securely in MongoDB.
        </p>
      </div>

      {/* Login Emails & Profile */}
      <form
        onSubmit={handleSaveEmails}
        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#00D4FF]" />
            <h2 className="text-base font-bold">Authorised Login Emails</h2>
          </div>
          <span className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
            Google Sign-In: {googleLinked ? 'Linked' : 'Ready via email match'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Display Name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Primary Login Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">
            Additional Emails (work for Password Login, Google Sign-In &amp; Password Reset)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={newSecondaryEmail}
              onChange={(e) => setNewSecondaryEmail(e.target.value)}
              placeholder="Add another email address (e.g. your personal Gmail)"
              className="flex-1 min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={addSecondaryEmail}
              className="min-h-[44px] inline-flex items-center justify-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-semibold hover:border-[#176BFF] shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Email
            </button>
          </div>

          {secondaryEmails.length > 0 && (
            <ul className="mt-3 divide-y divide-[#DCE3F2] dark:divide-[#1A2550] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B]">
              {secondaryEmails.map((sec) => (
                <li key={sec} className="px-3 py-2 flex items-center justify-between gap-2 text-xs font-mono">
                  <span className="truncate">{sec}</span>
                  <button
                    type="button"
                    onClick={() => setSecondaryEmails((prev) => prev.filter((item) => item !== sec))}
                    className="min-h-[36px] text-red-500 hover:text-red-400 inline-flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          type="submit"
          disabled={savingEmails}
          className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {savingEmails ? 'Saving Emails...' : 'Save My Login Emails'}
        </button>
      </form>

      {/* Set / Change Password */}
      <form
        onSubmit={handleUpdatePassword}
        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-[#00D4FF]" />
          <h2 className="text-base font-bold">
            {hasPassword ? 'Change Administrator Password' : 'Set Local Password'}
          </h2>
        </div>

        {hasPassword && (
          <div>
            <label className="block text-xs font-medium mb-1">Current Password *</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">New Password (min 10 chars) *</label>
            <input
              type="password"
              required
              minLength={10}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={10}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={savingPassword}
          className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-5 py-2.5 text-sm font-semibold text-white"
        >
          {savingPassword ? 'Updating Password...' : 'Update Password in MongoDB'}
        </button>
      </form>
    </div>
  );
}

export function AdminOpsModules({
  tab,
}: {
  tab: 'analytics' | 'notifications' | 'audit';
}) {
  const [analytics, setAnalytics] = useState<{
    byEvent: Array<{ _id: string; count: number }>;
    topPaths: Array<{ _id: string; count: number }>;
  }>({ byEvent: [], topPaths: [] });
  const [notifications, setNotifications] = useState<
    Array<{ _id: string; title: string; message: string; read: boolean; createdAt: string }>
  >([]);
  const [logs, setLogs] = useState<
    Array<{ _id: string; adminEmail: string; action: string; entityType: string; details: string; createdAt: string }>
  >([]);

  const load = useCallback(async () => {
    if (tab === 'analytics') {
      const r = await apiFetch('/api/admin/analytics', { credentials: 'include' });
      if (r.ok) setAnalytics(await r.json());
    } else if (tab === 'notifications') {
      const r = await apiFetch('/api/admin/notifications', { credentials: 'include' });
      if (r.ok) setNotifications((await r.json()).notifications || []);
    } else if (tab === 'audit') {
      const r = await apiFetch('/api/admin/audit-logs', { credentials: 'include' });
      if (r.ok) setLogs((await r.json()).logs || []);
    }
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  if (tab === 'analytics') {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Conversion &amp; Traffic Analytics (Consented Events)</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6">
            <h2 className="font-semibold mb-3">Events by Type</h2>
            {analytics.byEvent.length === 0 ? (
              <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">No tracked events yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {analytics.byEvent.map((e) => (
                  <li key={e._id} className="flex justify-between">
                    <span>{e._id}</span>
                    <span className="font-mono tabular-nums">{e.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6">
            <h2 className="font-semibold mb-3">Top Public Pages</h2>
            {analytics.topPaths.length === 0 ? (
              <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">No page views logged yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {analytics.topPaths.map((p) => (
                  <li key={p._id} className="flex justify-between">
                    <span className="font-mono text-xs">{p._id}</span>
                    <span className="font-mono tabular-nums">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (tab === 'notifications') {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">System Notifications</h1>
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n._id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">{n.title}</p>
                  <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{n.message}</p>
                </div>
                {!n.read ? (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/admin/notifications/${n._id}/read`, {
                        method: 'PATCH',
                        credentials: 'include',
                      });
                      load();
                    }}
                    className="text-xs font-medium text-[#176BFF] dark:text-[#00D4FF]"
                  >
                    Mark read
                  </button>
                ) : (
                  <Check className="w-4 h-4 text-[#00D4FF]" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Administrator Audit Log</h1>
      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
        {logs.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            No audit events recorded yet.
          </div>
        ) : (
          <>
            {/* Mobile Audit Cards (<md) */}
            <div className="md:hidden divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
              {logs.map((l) => (
                <div key={l._id} className="p-4 space-y-1.5 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono font-semibold text-[#176BFF] dark:text-[#00D4FF] break-all">
                      {l.action}
                    </span>
                    <span className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4] shrink-0">
                      {l.entityType}
                    </span>
                  </div>
                  <p className="text-[#070B24] dark:text-[#F7F8FF] break-words">{l.details}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                    <span className="truncate">{l.adminEmail}</span>
                    <span>{new Date(l.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Audit Table (>=md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4]">
                    <th className="p-3">Time</th>
                    <th className="p-3">Admin</th>
                    <th className="p-3">Action</th>
                    <th className="p-3">Entity</th>
                    <th className="p-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                  {logs.map((l) => (
                    <tr key={l._id}>
                      <td className="p-3 font-mono tabular-nums">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                      <td className="p-3">{l.adminEmail}</td>
                      <td className="p-3 font-mono">{l.action}</td>
                      <td className="p-3">{l.entityType}</td>
                      <td className="p-3">{l.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
