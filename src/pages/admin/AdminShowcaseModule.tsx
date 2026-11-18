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
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldError } from '../../components/FieldError';
import { RichContentRenderer } from '../../components/RichContentRenderer';
import { StarRatingDisplay, StarRatingPicker } from '../../components/StarRating';
import { LazyRichTextEditor } from '../../components/admin/LazyRichTextEditor';
import { StructuredListEditor } from '../../components/admin/StructuredListEditor';
import { useApp } from '../../context/AppContext';
import type { TestimonialItem, WorkShowcaseItem } from '../../types';
import { apiFetch } from '../../utils/authSession';
import {
  fieldBorderClass,
  type FieldErrors,
  testimonialWriteSchema,
  validateWithSchema,
  workShowcaseWriteSchema,
} from '../../utils/formValidation';

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
    outcomes: [] as string[],
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
  const [workDirty, setWorkDirty] = useState(false);
  const [discardWorkAction, setDiscardWorkAction] = useState<(() => void) | null>(null);
  const [workErrors, setWorkErrors] = useState<FieldErrors>({});
  const [testimonialErrors, setTestimonialErrors] = useState<FieldErrors>({});

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
    setWorkDirty(false);
    setWorkErrors({});
    setWorkForm({
      title: '',
      clientName: '',
      industry: '',
      category: 'AI Automation',
      summary: '',
      outcomes: [],
      technologiesText: '',
      imageUrl: '',
      projectUrl: '',
      featured: true,
      published: true,
      order: workItems.length,
    });
  };

  const guardWorkAction = (fn: () => void) => {
    if (showWorkForm && workDirty) {
      setDiscardWorkAction(() => fn);
    } else {
      fn();
    }
  };

  const resetTestimonialForm = () => {
    setEditingTestimonialId(null);
    setTestimonialErrors({});
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
    if (saving) return;
    const payload = {
      title: workForm.title,
      clientName: workForm.clientName,
      industry: workForm.industry,
      category: workForm.category,
      summary: workForm.summary,
      outcomes: (workForm.outcomes || []).map((s) => s.trim()).filter(Boolean),
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
    const check = validateWithSchema(workShowcaseWriteSchema, payload);
    if (!check.ok) {
      setWorkErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setWorkErrors({});
    setSaving(true);
    try {
      const url = editingWorkId ? `/api/admin/work/${editingWorkId}` : '/api/admin/work';
      const method = editingWorkId ? 'PATCH' : 'POST';
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setWorkErrors(data.fieldErrors);
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
    if (saving) return;
    const candidate = {
      ...testimonialForm,
      order: Number(testimonialForm.order || 0),
    };
    const check = validateWithSchema(testimonialWriteSchema, candidate);
    if (!check.ok) {
      setTestimonialErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setTestimonialErrors({});
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
        body: JSON.stringify(check.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setTestimonialErrors(data.fieldErrors);
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

        <div className="grid grid-cols-2 sm:inline-flex gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setSubTab('work')}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
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
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors ${
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
                  guardWorkAction(() => {
                    setShowWorkForm(false);
                    resetWorkForm();
                  });
                } else {
                  guardWorkAction(() => {
                    resetWorkForm();
                    setShowWorkForm(true);
                  });
                }
              }}
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="w-4 h-4" />
              {showWorkForm && !editingWorkId ? 'Close Form' : 'Add Project / Work Done'}
            </button>
          </div>

          {showWorkForm && (
            <form
              onSubmit={handleSaveWork}
              noValidate
              className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
            >
              <h2 className="text-base font-bold">
                {editingWorkId ? 'Edit Project Showcase' : 'Add Project / Work Done'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Project Title *</label>
                  <input
                    value={workForm.title}
                    onChange={(e) => {
                      setWorkForm((f) => ({ ...f, title: e.target.value }));
                      setWorkDirty(true);
                      setWorkErrors((p) => ({ ...p, title: '' }));
                    }}
                    placeholder="e.g., Automated Invoice & ERP Sync Pipeline"
                    aria-invalid={Boolean(workErrors.title)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      workErrors.title
                    )}
                  />
                  <FieldError message={workErrors.title} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Category *</label>
                  <input
                    value={workForm.category}
                    onChange={(e) => {
                      setWorkForm((f) => ({ ...f, category: e.target.value }));
                      setWorkDirty(true);
                      setWorkErrors((p) => ({ ...p, category: '' }));
                    }}
                    placeholder="AI Automation, Web Platform, Data Analytics..."
                    aria-invalid={Boolean(workErrors.category)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      workErrors.category
                    )}
                  />
                  <FieldError message={workErrors.category} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Client / Organisation</label>
                  <input
                    value={workForm.clientName}
                    onChange={(e) => {
                      setWorkForm((f) => ({ ...f, clientName: e.target.value }));
                      setWorkDirty(true);
                      setWorkErrors((p) => ({ ...p, clientName: '' }));
                    }}
                    placeholder="e.g., Apex Logistics"
                    aria-invalid={Boolean(workErrors.clientName)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      workErrors.clientName
                    )}
                  />
                  <FieldError message={workErrors.clientName} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Industry / Sector</label>
                  <input
                    value={workForm.industry}
                    onChange={(e) => {
                      setWorkForm((f) => ({ ...f, industry: e.target.value }));
                      setWorkDirty(true);
                      setWorkErrors((p) => ({ ...p, industry: '' }));
                    }}
                    placeholder="e.g., Logistics & Supply Chain"
                    aria-invalid={Boolean(workErrors.industry)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      workErrors.industry
                    )}
                  />
                  <FieldError message={workErrors.industry} />
                </div>
              </div>

              <LazyRichTextEditor
                label="Summary of Work & Problem Solved *"
                compact
                enableMedia={false}
                minHeightClass="min-h-[180px]"
                value={workForm.summary}
                onChange={(html) => {
                  setWorkForm((f) => ({ ...f, summary: html }));
                  setWorkDirty(true);
                  setWorkErrors((p) => ({ ...p, summary: '' }));
                }}
                placeholder="Describe what was built, how it works, and the business problem addressed..."
                error={workErrors.summary}
                saveStatus={saving ? 'saving' : workDirty ? 'dirty' : 'idle'}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StructuredListEditor
                  label="Key Outcomes / Results"
                  items={workForm.outcomes}
                  onChange={(next) => {
                    setWorkForm((f) => ({ ...f, outcomes: next }));
                    setWorkDirty(true);
                  }}
                  placeholder="e.g., Reduced manual reporting time by 80%"
                  emptyHint="No measurable outcomes added yet."
                />
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Technologies Used (comma-separated)
                    </label>
                    <input
                      value={workForm.technologiesText}
                      onChange={(e) => {
                        setWorkForm((f) => ({ ...f, technologiesText: e.target.value }));
                        setWorkDirty(true);
                      }}
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
                      onChange={(e) => {
                        setWorkForm((f) => ({ ...f, projectUrl: e.target.value }));
                        setWorkDirty(true);
                        setWorkErrors((p) => ({ ...p, projectUrl: '' }));
                      }}
                      placeholder="https://..."
                      aria-invalid={Boolean(workErrors.projectUrl)}
                      className={fieldBorderClass(
                        'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                        workErrors.projectUrl
                      )}
                    />
                    <FieldError message={workErrors.projectUrl} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div>
                  <label className="block text-xs font-medium mb-1">Image URL (Optional)</label>
                  <input
                    value={workForm.imageUrl}
                    onChange={(e) => {
                      setWorkForm((f) => ({ ...f, imageUrl: e.target.value }));
                      setWorkErrors((p) => ({ ...p, imageUrl: '' }));
                    }}
                    placeholder="/assets/images/..."
                    aria-invalid={Boolean(workErrors.imageUrl)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      workErrors.imageUrl
                    )}
                  />
                  <FieldError message={workErrors.imageUrl} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Display Order</label>
                  <input
                    type="number"
                    value={workForm.order}
                    onChange={(e) => {
                      setWorkForm((f) => ({ ...f, order: Number(e.target.value) }));
                      setWorkErrors((p) => ({ ...p, order: '' }));
                    }}
                    aria-invalid={Boolean(workErrors.order)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      workErrors.order
                    )}
                  />
                  <FieldError message={workErrors.order} />
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
                  onClick={() =>
                    guardWorkAction(() => {
                      setShowWorkForm(false);
                      resetWorkForm();
                    })
                  }
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
                    <div className="mt-1.5">
                      <RichContentRenderer content={item.summary} compact />
                    </div>
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
                        className="mt-2 inline-flex items-start gap-1 text-xs text-[#176BFF] dark:text-[#00D4FF] hover:underline break-all"
                      >
                        <span>{item.projectUrl}</span>
                        <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" />
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
                      onClick={() =>
                        guardWorkAction(() => {
                          setEditingWorkId(item._id);
                          setWorkDirty(false);
                          setWorkErrors({});
                          setWorkForm({
                            title: item.title,
                            clientName: item.clientName || '',
                            industry: item.industry || '',
                            category: item.category || 'AI Automation',
                            summary: item.summary,
                            outcomes: item.outcomes || [],
                            technologiesText: (item.technologies || []).join(', '),
                            imageUrl: item.imageUrl || '',
                            projectUrl: item.projectUrl || '',
                            featured: item.featured,
                            published: item.published,
                            order: item.order || 0,
                          });
                          setShowWorkForm(true);
                        })
                      }
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
              className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
            >
              <Plus className="w-4 h-4" />
              {showTestimonialForm && !editingTestimonialId ? 'Close Form' : 'Add Testimonial'}
            </button>
          </div>

          {showTestimonialForm && (
            <form
              onSubmit={handleSaveTestimonial}
              noValidate
              className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
            >
              <h2 className="text-base font-bold">
                {editingTestimonialId ? 'Edit Testimonial' : 'Add Client Testimonial'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium mb-1">Client Name *</label>
                  <input
                    value={testimonialForm.authorName}
                    onChange={(e) => {
                      setTestimonialForm((f) => ({ ...f, authorName: e.target.value }));
                      setTestimonialErrors((p) => ({ ...p, authorName: '' }));
                    }}
                    placeholder="e.g., Ama Boateng"
                    aria-invalid={Boolean(testimonialErrors.authorName)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      testimonialErrors.authorName
                    )}
                  />
                  <FieldError message={testimonialErrors.authorName} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Role / Title</label>
                  <input
                    value={testimonialForm.authorRole}
                    onChange={(e) => {
                      setTestimonialForm((f) => ({ ...f, authorRole: e.target.value }));
                      setTestimonialErrors((p) => ({ ...p, authorRole: '' }));
                    }}
                    placeholder="e.g., Head of Operations"
                    aria-invalid={Boolean(testimonialErrors.authorRole)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      testimonialErrors.authorRole
                    )}
                  />
                  <FieldError message={testimonialErrors.authorRole} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Company / Organisation</label>
                  <input
                    value={testimonialForm.company}
                    onChange={(e) => {
                      setTestimonialForm((f) => ({ ...f, company: e.target.value }));
                      setTestimonialErrors((p) => ({ ...p, company: '' }));
                    }}
                    placeholder="e.g., Crestline Financial"
                    aria-invalid={Boolean(testimonialErrors.company)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      testimonialErrors.company
                    )}
                  />
                  <FieldError message={testimonialErrors.company} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Testimonial Quote *</label>
                <textarea
                  rows={3}
                  value={testimonialForm.quote}
                  onChange={(e) => {
                    setTestimonialForm((f) => ({ ...f, quote: e.target.value }));
                    setTestimonialErrors((p) => ({ ...p, quote: '' }));
                  }}
                  placeholder="Share the client's feedback on NexaFlow's delivery or training..."
                  aria-invalid={Boolean(testimonialErrors.quote)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    testimonialErrors.quote
                  )}
                />
                <FieldError message={testimonialErrors.quote} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                <div>
                  <label className="block text-xs font-medium mb-1">Rating</label>
                  <StarRatingPicker
                    value={testimonialForm.rating}
                    onChange={(rating) => {
                      setTestimonialForm((f) => ({ ...f, rating }));
                      setTestimonialErrors((p) => ({ ...p, rating: '' }));
                    }}
                  />
                  <FieldError message={testimonialErrors.rating} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Project / Course Reference (Optional)
                  </label>
                  <input
                    value={testimonialForm.workTitle}
                    onChange={(e) => {
                      setTestimonialForm((f) => ({ ...f, workTitle: e.target.value }));
                      setTestimonialErrors((p) => ({ ...p, workTitle: '' }));
                    }}
                    placeholder="e.g., AI Workflow Automation"
                    aria-invalid={Boolean(testimonialErrors.workTitle)}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      testimonialErrors.workTitle
                    )}
                  />
                  <FieldError message={testimonialErrors.workTitle} />
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
                        setTestimonialErrors({});
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

      <ConfirmDialog
        open={Boolean(discardWorkAction)}
        title="Discard Unsaved Project Changes?"
        message="You have unsaved changes to this showcase project. Leave without saving?"
        confirmLabel="Discard Changes"
        onConfirm={() => {
          const fn = discardWorkAction;
          setDiscardWorkAction(null);
          fn?.();
        }}
        onCancel={() => setDiscardWorkAction(null)}
      />
    </div>
  );
}
