import React, { useCallback, useEffect, useState } from 'react';
import {
  Briefcase,
  Check,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
  Quote,
  Trash2,
} from 'lucide-react';
import { StarRatingDisplay, StarRatingPicker } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { TestimonialItem, WorkShowcaseItem } from '../../types';
import { apiFetch } from '../../utils/authSession';

export function AdminShowcaseModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [subTab, setSubTab] = useState<'work' | 'testimonials'>('work');

  // Work Done state
  const [workItems, setWorkItems] = useState<WorkShowcaseItem[]>([]);
  const [loadingWork, setLoadingWork] = useState(true);
  const [editingWorkId, setEditingWorkId] = useState<string | null>(null);
  const [showWorkForm, setShowWorkForm] = useState(false);
  const [workForm, setWorkForm] = useState({
    title: '',
    clientName: '',
    industry: '',
    category: 'AI Automation',
    summary: '',
    outcomesText: '',
    technologiesText: '',
    imageUrl: '',
    projectUrl: '',
    featured: true,
    published: true,
    order: 0,
  });

  // Testimonials state
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [loadingTestimonials, setLoadingTestimonials] = useState(true);
  const [editingTestimonialId, setEditingTestimonialId] = useState<string | null>(null);
  const [showTestimonialForm, setShowTestimonialForm] = useState(false);
  const [testimonialForm, setTestimonialForm] = useState({
    authorName: '',
    authorRole: '',
    company: '',
    quote: '',
    rating: 5,
    workTitle: '',
    featured: true,
    published: true,
    order: 0,
  });

  const [saving, setSaving] = useState(false);

  const loadWork = useCallback(async () => {
    setLoadingWork(true);
    try {
      const res = await apiFetch('/api/admin/work', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setWorkItems(data.workItems || []);
      }
    } finally {
      setLoadingWork(false);
    }
  }, []);

  const loadTestimonials = useCallback(async () => {
    setLoadingTestimonials(true);
    try {
      const res = await apiFetch('/api/admin/testimonials', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setTestimonials(data.testimonials || []);
      }
    } finally {
      setLoadingTestimonials(false);
    }
  }, []);

  useEffect(() => {
    loadWork();
    loadTestimonials();
  }, [loadWork, loadTestimonials]);

  const resetWorkForm = () => {
    setEditingWorkId(null);
    setWorkForm({
      title: '',
      clientName: '',
      industry: '',
      category: 'AI Automation',
      summary: '',
      outcomesText: '',
      technologiesText: '',
      imageUrl: '',
      projectUrl: '',
      featured: true,
      published: true,
      order: workItems.length,
    });
  };

  const resetTestimonialForm = () => {
    setEditingTestimonialId(null);
    setTestimonialForm({
      authorName: '',
      authorRole: '',
      company: '',
      quote: '',
      rating: 5,
      workTitle: '',
      featured: true,
      published: true,
      order: testimonials.length,
    });
  };

  const handleSaveWork = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title: workForm.title,
        clientName: workForm.clientName,
        industry: workForm.industry,
        category: workForm.category,
        summary: workForm.summary,
        outcomes: workForm.outcomesText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        technologies: workForm.technologiesText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        imageUrl: workForm.imageUrl,
        projectUrl: workForm.projectUrl,
        featured: workForm.featured,
        published: workForm.published,
        order: Number(workForm.order || 0),
      };

      const url = editingWorkId ? `/api/admin/work/${editingWorkId}` : '/api/admin/work';
      const method = editingWorkId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not save work item.', 'error');
        return;
      }
      showToast(editingWorkId ? 'Work item updated.' : 'Work item added.', 'success');
      setShowWorkForm(false);
      resetWorkForm();
      await Promise.all([loadWork(), refreshBootstrap()]);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWorkPublished = async (item: WorkShowcaseItem) => {
    const res = await apiFetch(`/api/admin/work/${item._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ published: !item.published }),
    });
    if (res.ok) {
      showToast(item.published ? 'Hidden from public site.' : 'Published to public site.', 'success');
      await Promise.all([loadWork(), refreshBootstrap()]);
    }
  };

  const handleDeleteWork = async (id: string) => {
    const res = await apiFetch(`/api/admin/work/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      showToast('Work item deleted.', 'info');
      await Promise.all([loadWork(), refreshBootstrap()]);
    }
  };

  const handleSaveTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = editingTestimonialId
        ? `/api/admin/testimonials/${editingTestimonialId}`
        : '/api/admin/testimonials';
      const method = editingTestimonialId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...testimonialForm,
          order: Number(testimonialForm.order || 0),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not save testimonial.', 'error');
        return;
      }
      showToast(
        editingTestimonialId ? 'Testimonial updated.' : 'Testimonial added.',
        'success'
      );
      setShowTestimonialForm(false);
      resetTestimonialForm();
      await Promise.all([loadTestimonials(), refreshBootstrap()]);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleTestimonialPublished = async (item: TestimonialItem) => {
    const res = await apiFetch(`/api/admin/testimonials/${item._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ published: !item.published }),
    });
    if (res.ok) {
      showToast(item.published ? 'Testimonial hidden.' : 'Testimonial published.', 'success');
      await Promise.all([loadTestimonials(), refreshBootstrap()]);
    }
  };

  const handleDeleteTestimonial = async (id: string) => {
    const res = await apiFetch(`/api/admin/testimonials/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      showToast('Testimonial deleted.', 'info');
      await Promise.all([loadTestimonials(), refreshBootstrap()]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Work Done &amp; Testimonials</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Manage client project case studies and verified testimonials displayed on your public site.
          </p>
        </div>

        <div className="inline-flex rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-1">
          <button
            type="button"
            onClick={() => setSubTab('work')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              subTab === 'work'
                ? 'bg-[#176BFF] text-white'
                : 'text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-white'
            }`}
          >
            <Briefcase className="w-3.5 h-3.5" />
            Work Done ({workItems.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('testimonials')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              subTab === 'testimonials'
                ? 'bg-[#176BFF] text-white'
                : 'text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-white'
            }`}
          >
            <Quote className="w-3.5 h-3.5" />
            Testimonials ({testimonials.length})
          </button>
        </div>
      </div>

      {/* WORK DONE TAB */}
      {subTab === 'work' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (showWorkForm && !editingWorkId) {
                  setShowWorkForm(false);
                } else {
                  resetWorkForm();
                  setShowWorkForm(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="w-4 h-4" />
              {showWorkForm && !editingWorkId ? 'Close Form' : 'Add Project / Work Done'}
            </button>
          </div>

          {showWorkForm && (
            <form
              onSubmit={handleSaveWork}
              className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
            >
              <h2 className="text-base font-bold">
                {editingWorkId ? 'Edit Project Showcase' : 'Add Project / Work Done'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Project Title *</label>
                  <input
                    required
                    value={workForm.title}
                    onChange={(e) => setWorkForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g., Automated Invoice & ERP Sync Pipeline"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Category</label>
                  <input
                    value={workForm.category}
                    onChange={(e) => setWorkForm((f) => ({ ...f, category: e.target.value }))}
                    placeholder="AI Automation, Web Platform, Data Analytics..."
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Client / Organisation</label>
                  <input
                    value={workForm.clientName}
                    onChange={(e) => setWorkForm((f) => ({ ...f, clientName: e.target.value }))}
                    placeholder="e.g., Apex Logistics"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Industry / Sector</label>
                  <input
                    value={workForm.industry}
                    onChange={(e) => setWorkForm((f) => ({ ...f, industry: e.target.value }))}
                    placeholder="e.g., Logistics & Supply Chain"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Summary of Work &amp; Problem Solved *
                </label>
                <textarea
                  required
                  rows={3}
                  value={workForm.summary}
                  onChange={(e) => setWorkForm((f) => ({ ...f, summary: e.target.value }))}
                  placeholder="Describe what was built, how it works, and the business problem addressed..."
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Key Outcomes / Results (one per line)
                  </label>
                  <textarea
                    rows={3}
                    value={workForm.outcomesText}
                    onChange={(e) => setWorkForm((f) => ({ ...f, outcomesText: e.target.value }))}
                    placeholder={'Reduced manual reporting time by 80%\nIntegrated live Paystack & ERP reconciliation'}
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Technologies Used (comma-separated)
                    </label>
                    <input
                      value={workForm.technologiesText}
                      onChange={(e) =>
                        setWorkForm((f) => ({ ...f, technologiesText: e.target.value }))
                      }
                      placeholder="React, Node.js, MongoDB, Python"
                      className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Project / Live URL (Optional)
                    </label>
                    <input
                      value={workForm.projectUrl}
                      onChange={(e) => setWorkForm((f) => ({ ...f, projectUrl: e.target.value }))}
                      placeholder="https://..."
                      className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <label className="block text-xs font-medium mb-1">Image URL (Optional)</label>
                  <input
                    value={workForm.imageUrl}
                    onChange={(e) => setWorkForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="/assets/images/..."
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Display Order</label>
                  <input
                    type="number"
                    value={workForm.order}
                    onChange={(e) => setWorkForm((f) => ({ ...f, order: Number(e.target.value) }))}
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center gap-5 pt-4">
                  <label className="inline-flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={workForm.published}
                      onChange={(e) =>
                        setWorkForm((f) => ({ ...f, published: e.target.checked }))
                      }
                    />
                    Published
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={workForm.featured}
                      onChange={(e) => setWorkForm((f) => ({ ...f, featured: e.target.checked }))}
                    />
                    Featured
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowWorkForm(false);
                    resetWorkForm();
                  }}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-50 px-5 py-2 text-xs font-semibold text-white"
                >
                  {saving ? 'Saving...' : editingWorkId ? 'Update Project' : 'Save Project'}
                </button>
              </div>
            </form>
          )}

          {loadingWork ? (
            <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">Loading projects...</p>
          ) : workItems.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
              No work showcase projects added yet. Click &ldquo;Add Project / Work Done&rdquo; to
              highlight client deliveries on the public site.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workItems.map((item) => (
                <div
                  key={item._id}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#176BFF] dark:text-[#00D4FF]">
                        {item.category}
                        {item.clientName ? ` · ${item.clientName}` : ''}
                      </span>
                      <span
                        className={`text-[11px] font-mono ${
                          item.published
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[#4A5578] dark:text-[#AEB8D4]'
                        }`}
                      >
                        {item.published ? 'Published' : 'Hidden'}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-bold">{item.title}</h3>
                    <p className="mt-1.5 text-xs text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                      {item.summary}
                    </p>
                    {item.outcomes?.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs">
                        {item.outcomes.map((o) => (
                          <li key={o} className="flex items-start gap-1.5">
                            <Check className="w-3.5 h-3.5 text-[#00D4FF] shrink-0 mt-0.5" />
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {item.projectUrl && (
                      <a
                        href={item.projectUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                      >
                        {item.projectUrl}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[#DCE3F2] dark:border-[#1A2550] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleWorkPublished(item)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium"
                    >
                      {item.published ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          Publish
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingWorkId(item._id);
                        setWorkForm({
                          title: item.title,
                          clientName: item.clientName || '',
                          industry: item.industry || '',
                          category: item.category || 'AI Automation',
                          summary: item.summary,
                          outcomesText: (item.outcomes || []).join('\n'),
                          technologiesText: (item.technologies || []).join(', '),
                          imageUrl: item.imageUrl || '',
                          projectUrl: item.projectUrl || '',
                          featured: item.featured,
                          published: item.published,
                          order: item.order || 0,
                        });
                        setShowWorkForm(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWork(item._id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TESTIMONIALS TAB */}
      {subTab === 'testimonials' && (
        <div className="space-y-5">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (showTestimonialForm && !editingTestimonialId) {
                  setShowTestimonialForm(false);
                } else {
                  resetTestimonialForm();
                  setShowTestimonialForm(true);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="w-4 h-4" />
              {showTestimonialForm && !editingTestimonialId ? 'Close Form' : 'Add Testimonial'}
            </button>
          </div>

          {showTestimonialForm && (
            <form
              onSubmit={handleSaveTestimonial}
              className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
            >
              <h2 className="text-base font-bold">
                {editingTestimonialId ? 'Edit Testimonial' : 'Add Client Testimonial'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Client Name *</label>
                  <input
                    required
                    value={testimonialForm.authorName}
                    onChange={(e) =>
                      setTestimonialForm((f) => ({ ...f, authorName: e.target.value }))
                    }
                    placeholder="e.g., Ama Boateng"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Role / Title</label>
                  <input
                    value={testimonialForm.authorRole}
                    onChange={(e) =>
                      setTestimonialForm((f) => ({ ...f, authorRole: e.target.value }))
                    }
                    placeholder="e.g., Head of Operations"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Company / Organisation</label>
                  <input
                    value={testimonialForm.company}
                    onChange={(e) =>
                      setTestimonialForm((f) => ({ ...f, company: e.target.value }))
                    }
                    placeholder="e.g., Crestline Financial"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Testimonial Quote *</label>
                <textarea
                  required
                  rows={3}
                  value={testimonialForm.quote}
                  onChange={(e) =>
                    setTestimonialForm((f) => ({ ...f, quote: e.target.value }))
                  }
                  placeholder="Share the client's feedback on NexaFlow's delivery or training..."
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <label className="block text-xs font-medium mb-1">Rating</label>
                  <StarRatingPicker
                    value={testimonialForm.rating}
                    onChange={(rating) => setTestimonialForm((f) => ({ ...f, rating }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Project / Course Reference (Optional)
                  </label>
                  <input
                    value={testimonialForm.workTitle}
                    onChange={(e) =>
                      setTestimonialForm((f) => ({ ...f, workTitle: e.target.value }))
                    }
                    placeholder="e.g., AI Workflow Automation"
                    className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex items-center gap-5 pt-4">
                  <label className="inline-flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={testimonialForm.published}
                      onChange={(e) =>
                        setTestimonialForm((f) => ({ ...f, published: e.target.checked }))
                      }
                    />
                    Published
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium">
                    <input
                      type="checkbox"
                      checked={testimonialForm.featured}
                      onChange={(e) =>
                        setTestimonialForm((f) => ({ ...f, featured: e.target.checked }))
                      }
                    />
                    Featured
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowTestimonialForm(false);
                    resetTestimonialForm();
                  }}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-50 px-5 py-2 text-xs font-semibold text-white"
                >
                  {saving
                    ? 'Saving...'
                    : editingTestimonialId
                      ? 'Update Testimonial'
                      : 'Save Testimonial'}
                </button>
              </div>
            </form>
          )}

          {loadingTestimonials ? (
            <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">Loading testimonials...</p>
          ) : testimonials.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
              No client testimonials added yet. Click &ldquo;Add Testimonial&rdquo; to publish
              verified client reviews on the public site.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {testimonials.map((t) => (
                <div
                  key={t._id}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <StarRatingDisplay rating={t.rating} showEmptyLabel={false} size="xs" />
                      <span
                        className={`text-[11px] font-mono ${
                          t.published
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-[#4A5578] dark:text-[#AEB8D4]'
                        }`}
                      >
                        {t.published ? 'Published' : 'Hidden'}
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                    <div className="mt-3 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                      <strong className="text-[#070B24] dark:text-[#F7F8FF]">{t.authorName}</strong>
                      {(t.authorRole || t.company) && (
                        <span> · {[t.authorRole, t.company].filter(Boolean).join(', ')}</span>
                      )}
                      {t.workTitle && (
                        <p className="mt-0.5 font-mono text-[11px] text-[#176BFF] dark:text-[#00D4FF]">
                          {t.workTitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#DCE3F2] dark:border-[#1A2550] flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleTestimonialPublished(t)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium"
                    >
                      {t.published ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          Publish
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTestimonialId(t._id);
                        setTestimonialForm({
                          authorName: t.authorName,
                          authorRole: t.authorRole || '',
                          company: t.company || '',
                          quote: t.quote,
                          rating: t.rating || 5,
                          workTitle: t.workTitle || '',
                          featured: t.featured,
                          published: t.published,
                          order: t.order || 0,
                        });
                        setShowTestimonialForm(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTestimonial(t._id)}
                      className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
