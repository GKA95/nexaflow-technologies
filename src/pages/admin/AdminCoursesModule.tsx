import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Eye, EyeOff, Plus, RefreshCw, Trash2, Video } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FieldError } from '../../components/FieldError';
import { MediaImage } from '../../components/MediaImage';
import { useApp } from '../../context/AppContext';
import type { CourseItem, LessonItem } from '../../types';
import { apiFetch } from '../../utils/authSession';
import { needsServerImageResolution, normalizeImageUrl } from '../../utils/media';
import {
  bulkLessonsWriteSchema,
  courseWriteSchema,
  fieldBorderClass,
  type FieldErrors,
  lessonWriteSchema,
  moduleWriteSchema,
  validateWithSchema,
} from '../../utils/formValidation';

interface DraftVideoRow {
  title: string;
  youtubeUrl: string;
  duration: string;
  notes: string;
}

export function AdminCoursesModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [editingCourse, setEditingCourse] = useState<Partial<CourseItem> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'course' | 'module' | 'lesson';
    id: string;
    label: string;
  } | null>(null);

  // Module & Lesson forms
  const [newModTitle, setNewModTitle] = useState<Record<string, string>>({});
  const [editingLesson, setEditingLesson] = useState<{
    _id: string;
    title: string;
    youtubeUrl: string;
    duration: string;
    notes: string;
    order: number;
  } | null>(null);

  // Bulk / Multi Sub-Video form attached to a course (auto-creates a default module if none exists)
  const [multiVideoCourse, setMultiVideoCourse] = useState<{
    courseId: string;
    courseTitle: string;
    moduleId: string;
    modules: Array<{ _id: string; title: string }>;
    rows: DraftVideoRow[];
  } | null>(null);
  const [savingVideos, setSavingVideos] = useState(false);
  const [savingCourse, setSavingCourse] = useState(false);
  const [savingLesson, setSavingLesson] = useState(false);
  const [addingModId, setAddingModId] = useState<string | null>(null);
  const [courseErrors, setCourseErrors] = useState<FieldErrors>({});
  const [multiVideoErrors, setMultiVideoErrors] = useState<FieldErrors>({});
  const [lessonErrors, setLessonErrors] = useState<FieldErrors>({});
  const [modErrors, setModErrors] = useState<Record<string, string>>({});

  const loadCourses = useCallback(async () => {
    const res = await apiFetch('/api/admin/courses', { credentials: 'include' });
    if (res.ok) {
      const d = await res.json();
      setCourses(d.courses || []);
    }
  }, []);

  useEffect(() => {
    loadCourses();
  }, [loadCourses]);

  const [resolvingCover, setResolvingCover] = useState(false);

  const resolveCoverLink = async (rawValue: string, silent = false) => {
    const trimmed = String(rawValue || '').trim();
    if (!trimmed) return;
    const quick = normalizeImageUrl(trimmed);
    if (quick && quick !== trimmed && !needsServerImageResolution(trimmed)) {
      setEditingCourse((prev) => (prev ? { ...prev, coverImage: quick } : prev));
      if (!silent) showToast('Imgur/external URL normalized to direct image link.', 'success');
      return;
    }
    if (!needsServerImageResolution(trimmed) && silent) return;

    setResolvingCover(true);
    try {
      const res = await apiFetch('/api/admin/resolve-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { resolvedUrl?: string; error?: string };
      if (res.ok && data.resolvedUrl) {
        setEditingCourse((prev) => (prev ? { ...prev, coverImage: data.resolvedUrl } : prev));
        if (!silent) showToast('Resolved direct cover image URL.', 'success');
      } else if (!silent) {
        showToast(data.error || 'Could not resolve external link; proxy fallback will still attempt to load it.', 'info');
      }
    } catch {
      if (!silent) showToast('Could not reach resolver right now.', 'error');
    } finally {
      setResolvingCover(false);
    }
  };

  const saveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || savingCourse) return;
    const candidate = {
      title: editingCourse.title || '',
      slug: editingCourse.slug || '',
      shortDescription: editingCourse.shortDescription || '',
      fullDescription: editingCourse.fullDescription || '',
      coverImage: normalizeImageUrl(editingCourse.coverImage || ''),
      price: Number(editingCourse.price ?? 0),
      currency: (editingCourse.currency || 'GHS').trim().toUpperCase(),
      objectives: editingCourse.objectives || [],
      outcomes: editingCourse.outcomes || [],
      published: Boolean(editingCourse.published),
      order: Number(editingCourse.order ?? 0),
    };
    const check = validateWithSchema(courseWriteSchema, candidate);
    if (!check.ok) {
      setCourseErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setCourseErrors({});
    setSavingCourse(true);
    try {
      const isNew = !editingCourse._id;
      const res = await apiFetch(
        isNew ? '/api/admin/courses' : `/api/admin/courses/${editingCourse._id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(check.data),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setCourseErrors(data.fieldErrors);
        showToast(data.error || 'Failed to save course.', 'error');
        return;
      }
      showToast(isNew ? 'Course created.' : 'Course updated.', 'success');
      setEditingCourse(null);
      setCourseErrors({});
      loadCourses();
      refreshBootstrap();
    } finally {
      setSavingCourse(false);
    }
  };

  const togglePublish = async (c: CourseItem) => {
    await apiFetch(`/api/admin/courses/${c._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ published: !c.published }),
    });
    loadCourses();
    refreshBootstrap();
  };

  const addModule = async (courseId: string) => {
    if (addingModId === courseId) return;
    const title = (newModTitle[courseId] || '').trim();
    const check = validateWithSchema(moduleWriteSchema, { title });
    if (!check.ok) {
      setModErrors((prev) => ({
        ...prev,
        [courseId]: check.fieldErrors.title || check.message,
      }));
      showToast(check.message, 'error');
      return;
    }
    setModErrors((prev) => ({ ...prev, [courseId]: '' }));
    setAddingModId(courseId);
    try {
      const res = await apiFetch(`/api/admin/courses/${courseId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: check.data.title }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewModTitle((p) => ({ ...p, [courseId]: '' }));
        loadCourses();
        showToast('Section/module added.', 'success');
      } else {
        setModErrors((prev) => ({ ...prev, [courseId]: data.error || 'Failed to add section.' }));
        showToast(data.error || 'Failed to add section.', 'error');
      }
    } finally {
      setAddingModId(null);
    }
  };

  const openMultiVideoForm = (course: CourseItem, preselectModuleId = '') => {
    const mods = (course.modules || []).map((m) => ({ _id: m._id, title: m.title }));
    setEditingLesson(null);
    setMultiVideoErrors({});
    setMultiVideoCourse({
      courseId: course._id,
      courseTitle: course.title,
      moduleId: preselectModuleId || mods[0]?._id || '',
      modules: mods,
      rows: [{ title: '', youtubeUrl: '', duration: '', notes: '' }],
    });
  };

  const saveMultiVideos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!multiVideoCourse || savingVideos) return;
    const check = validateWithSchema(bulkLessonsWriteSchema, {
      moduleId: multiVideoCourse.moduleId || '',
      lessons: multiVideoCourse.rows,
    });
    if (!check.ok) {
      setMultiVideoErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setMultiVideoErrors({});
    setSavingVideos(true);
    try {
      const res = await apiFetch(`/api/admin/courses/${multiVideoCourse.courseId}/lessons/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          moduleId: check.data.moduleId || undefined,
          lessons: check.data.lessons,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.fieldErrors) setMultiVideoErrors(d.fieldErrors);
        showToast(d.error || 'Could not add sub-videos.', 'error');
        return;
      }
      showToast(`${multiVideoCourse.rows.length} sub-video(s) added to course.`, 'success');
      setMultiVideoCourse(null);
      setMultiVideoErrors({});
      loadCourses();
      refreshBootstrap();
    } finally {
      setSavingVideos(false);
    }
  };

  const updateExistingLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson || savingLesson) return;
    const check = validateWithSchema(lessonWriteSchema, {
      title: editingLesson.title,
      youtubeUrl: editingLesson.youtubeUrl,
      duration: editingLesson.duration,
      notes: editingLesson.notes,
      order: editingLesson.order,
    });
    if (!check.ok) {
      setLessonErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }
    setLessonErrors({});
    setSavingLesson(true);
    try {
      const res = await apiFetch(`/api/admin/lessons/${editingLesson._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.fieldErrors) setLessonErrors(d.fieldErrors);
        showToast(d.error || 'Failed to update video lesson.', 'error');
        return;
      }
      showToast('Sub-video updated.', 'success');
      setEditingLesson(null);
      setLessonErrors({});
      loadCourses();
      refreshBootstrap();
    } finally {
      setSavingLesson(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const urlMap = {
      course: `/api/admin/courses/${deleteTarget.id}`,
      module: `/api/admin/modules/${deleteTarget.id}`,
      lesson: `/api/admin/lessons/${deleteTarget.id}`,
    };
    await apiFetch(urlMap[deleteTarget.type], { method: 'DELETE', credentials: 'include' });
    setDeleteTarget(null);
    loadCourses();
    refreshBootstrap();
    showToast('Deleted.', 'info');
  };

  const startEditLesson = (l: LessonItem) => {
    setMultiVideoCourse(null);
    setLessonErrors({});
    setEditingLesson({
      _id: l._id,
      title: l.title,
      youtubeUrl: l.youtubeUrl || '',
      duration: l.duration || '',
      notes: l.notes || '',
      order: l.order || 1,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Course &amp; Multi-Video Lesson Manager</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Set one main course description and attach one or more protected Unlisted YouTube sub-videos per course.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCourseErrors({});
            setEditingCourse({
              title: '',
              slug: '',
              shortDescription: '',
              fullDescription: '',
              coverImage: '',
              price: 0,
              currency: 'GHS',
              objectives: [],
              outcomes: [],
              published: false,
            });
          }}
          className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Course
        </button>
      </div>

      {editingCourse && (
        <form
          onSubmit={saveCourse}
          noValidate
          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <h2 className="text-lg font-bold">
            {editingCourse._id ? `Edit Course: ${editingCourse.title}` : 'Create New Course'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Course Title *</label>
              <input
                type="text"
                value={editingCourse.title || ''}
                onChange={(e) => {
                  setEditingCourse({ ...editingCourse, title: e.target.value });
                  setCourseErrors((p) => ({ ...p, title: '' }));
                }}
                aria-invalid={Boolean(courseErrors.title)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  courseErrors.title
                )}
              />
              <FieldError message={courseErrors.title} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Slug (auto if blank)</label>
              <input
                type="text"
                value={editingCourse.slug || ''}
                onChange={(e) => {
                  setEditingCourse({ ...editingCourse, slug: e.target.value });
                  setCourseErrors((p) => ({ ...p, slug: '' }));
                }}
                aria-invalid={Boolean(courseErrors.slug)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  courseErrors.slug
                )}
              />
              <FieldError message={courseErrors.slug} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Price</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={editingCourse.price ?? 0}
                onChange={(e) => {
                  setEditingCourse({ ...editingCourse, price: Number(e.target.value) });
                  setCourseErrors((p) => ({ ...p, price: '' }));
                }}
                aria-invalid={Boolean(courseErrors.price)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  courseErrors.price
                )}
              />
              <FieldError message={courseErrors.price} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Currency</label>
              <select
                value={(editingCourse.currency || 'GHS').toUpperCase()}
                onChange={(e) => {
                  setEditingCourse({ ...editingCourse, currency: e.target.value });
                  setCourseErrors((p) => ({ ...p, currency: '' }));
                }}
                aria-invalid={Boolean(courseErrors.currency)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  courseErrors.currency
                )}
              >
                <option value="GHS">GHS (Ghana Cedi)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="NGN">NGN (Nigerian Naira)</option>
                <option value="KES">KES (Kenyan Shilling)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="GBP">GBP (British Pound)</option>
              </select>
              <FieldError message={courseErrors.currency} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Cover Image URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingCourse.coverImage || ''}
                  onChange={(e) => {
                    setEditingCourse({ ...editingCourse, coverImage: e.target.value });
                    setCourseErrors((p) => ({ ...p, coverImage: '' }));
                  }}
                  onBlur={(e) => {
                    void resolveCoverLink(e.target.value, true);
                  }}
                  placeholder="https://i.imgur.com/... or https://imgur.com/... or /assets/images/..."
                  aria-invalid={Boolean(courseErrors.coverImage)}
                  className={fieldBorderClass(
                    'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    courseErrors.coverImage
                  )}
                />
                {editingCourse.coverImage?.trim() && (
                  <button
                    type="button"
                    disabled={resolvingCover}
                    onClick={() => void resolveCoverLink(editingCourse.coverImage || '', false)}
                    title="Resolve Imgur / external link"
                    className="shrink-0 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-2 text-xs font-medium hover:border-[#00D4FF] disabled:opacity-60 inline-flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${resolvingCover ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-[#4A5578] dark:text-[#AEB8D4]">
                Imgur links (direct, page, or album), Google Drive links, and local paths are normalized automatically.
              </p>
              <FieldError message={courseErrors.coverImage} />
            </div>
          </div>

          {editingCourse.coverImage?.trim() && (
            <div className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-3 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-full sm:w-44 aspect-video rounded-lg overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] bg-[#080D2B] shrink-0">
                <MediaImage
                  src={editingCourse.coverImage}
                  alt={editingCourse.title || 'Course cover preview'}
                  fallbackLabel="Preview unavailable"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 text-xs space-y-1">
                <p className="font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                  Live Cover Preview
                </p>
                <p className="font-mono text-[11px] text-[#4A5578] dark:text-[#AEB8D4] break-all">
                  {normalizeImageUrl(editingCourse.coverImage)}
                </p>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium mb-1">Short Summary *</label>
            <textarea
              rows={2}
              value={editingCourse.shortDescription || ''}
              onChange={(e) => {
                setEditingCourse({ ...editingCourse, shortDescription: e.target.value });
                setCourseErrors((p) => ({ ...p, shortDescription: '' }));
              }}
              placeholder="Concise summary shown on course catalogue cards and hero banner"
              aria-invalid={Boolean(courseErrors.shortDescription)}
              className={fieldBorderClass(
                'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                courseErrors.shortDescription
              )}
            />
            <FieldError message={courseErrors.shortDescription} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Main Course Description (Full Overview for All Sub-Videos)
            </label>
            <textarea
              rows={5}
              value={editingCourse.fullDescription || ''}
              onChange={(e) => {
                setEditingCourse({ ...editingCourse, fullDescription: e.target.value });
                setCourseErrors((p) => ({ ...p, fullDescription: '' }));
              }}
              placeholder="Write the comprehensive overview covering the entire course and all video lessons inside it..."
              aria-invalid={Boolean(courseErrors.fullDescription)}
              className={fieldBorderClass(
                'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                courseErrors.fullDescription
              )}
            />
            <FieldError message={courseErrors.fullDescription} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Objectives (one per line)</label>
              <textarea
                rows={3}
                value={(editingCourse.objectives || []).join('\n')}
                onChange={(e) =>
                  setEditingCourse({
                    ...editingCourse,
                    objectives: e.target.value.split('\n').filter(Boolean),
                  })
                }
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Learning Outcomes (one per line)</label>
              <textarea
                rows={3}
                value={(editingCourse.outcomes || []).join('\n')}
                onChange={(e) =>
                  setEditingCourse({
                    ...editingCourse,
                    outcomes: e.target.value.split('\n').filter(Boolean),
                  })
                }
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(editingCourse.published)}
              onChange={(e) => setEditingCourse({ ...editingCourse, published: e.target.checked })}
            />
            Publish Course Publicly
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={savingCourse}
              className="min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
            >
              {savingCourse ? 'Saving Course...' : 'Save Course'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCourse(null);
                setCourseErrors({});
              }}
              className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Multi Sub-Video Batch Adder */}
      {multiVideoCourse && (
        <form
          onSubmit={saveMultiVideos}
          noValidate
          className="rounded-xl border border-[#176BFF] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold">
                Add Sub-Videos to &ldquo;{multiVideoCourse.courseTitle}&rdquo;
              </h3>
              <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                Add one or multiple Unlisted YouTube videos to this course. Learners stream them strictly inside the protected on-platform player.
              </p>
            </div>
            {multiVideoCourse.modules.length > 0 && (
              <select
                value={multiVideoCourse.moduleId}
                onChange={(e) =>
                  setMultiVideoCourse({ ...multiVideoCourse, moduleId: e.target.value })
                }
                className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-1.5 text-xs"
              >
                {multiVideoCourse.modules.map((m) => (
                  <option key={m._id} value={m._id}>
                    Section: {m.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          <FieldError message={multiVideoErrors.lessons || multiVideoErrors.moduleId} />

          <div className="space-y-4">
            {multiVideoCourse.rows.map((row, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC]/60 dark:bg-[#03051B]/60 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-semibold text-[#176BFF] dark:text-[#00D4FF]">
                    Sub-Video #{idx + 1}
                  </span>
                  {multiVideoCourse.rows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setMultiVideoErrors({});
                        setMultiVideoCourse({
                          ...multiVideoCourse,
                          rows: multiVideoCourse.rows.filter((_, rIdx) => rIdx !== idx),
                        });
                      }}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove Row
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Video Title *"
                      value={row.title}
                      onChange={(e) => {
                        const next = [...multiVideoCourse.rows];
                        next[idx] = { ...next[idx], title: e.target.value };
                        setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                        setMultiVideoErrors((p) => ({ ...p, [`lessons.${idx}.title`]: '' }));
                      }}
                      aria-invalid={Boolean(multiVideoErrors[`lessons.${idx}.title`])}
                      className={fieldBorderClass(
                        'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm',
                        multiVideoErrors[`lessons.${idx}.title`]
                      )}
                    />
                    <FieldError message={multiVideoErrors[`lessons.${idx}.title`]} />
                  </div>
                  <div>
                    <input
                      type="url"
                      placeholder="Unlisted YouTube URL (https://youtu.be/...) *"
                      value={row.youtubeUrl}
                      onChange={(e) => {
                        const next = [...multiVideoCourse.rows];
                        next[idx] = { ...next[idx], youtubeUrl: e.target.value };
                        setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                        setMultiVideoErrors((p) => ({ ...p, [`lessons.${idx}.youtubeUrl`]: '' }));
                      }}
                      aria-invalid={Boolean(multiVideoErrors[`lessons.${idx}.youtubeUrl`])}
                      className={fieldBorderClass(
                        'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm',
                        multiVideoErrors[`lessons.${idx}.youtubeUrl`]
                      )}
                    />
                    <FieldError message={multiVideoErrors[`lessons.${idx}.youtubeUrl`]} />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Duration (e.g. 14:20)"
                      value={row.duration}
                      onChange={(e) => {
                        const next = [...multiVideoCourse.rows];
                        next[idx] = { ...next[idx], duration: e.target.value };
                        setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                        setMultiVideoErrors((p) => ({ ...p, [`lessons.${idx}.duration`]: '' }));
                      }}
                      aria-invalid={Boolean(multiVideoErrors[`lessons.${idx}.duration`])}
                      className={fieldBorderClass(
                        'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm',
                        multiVideoErrors[`lessons.${idx}.duration`]
                      )}
                    />
                    <FieldError message={multiVideoErrors[`lessons.${idx}.duration`]} />
                  </div>
                </div>
                <div>
                  <input
                    type="text"
                    placeholder="Optional sub-video notes..."
                    value={row.notes}
                    onChange={(e) => {
                      const next = [...multiVideoCourse.rows];
                      next[idx] = { ...next[idx], notes: e.target.value };
                      setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                      setMultiVideoErrors((p) => ({ ...p, [`lessons.${idx}.notes`]: '' }));
                    }}
                    aria-invalid={Boolean(multiVideoErrors[`lessons.${idx}.notes`])}
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-xs',
                      multiVideoErrors[`lessons.${idx}.notes`]
                    )}
                  />
                  <FieldError message={multiVideoErrors[`lessons.${idx}.notes`]} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                setMultiVideoCourse({
                  ...multiVideoCourse,
                  rows: [
                    ...multiVideoCourse.rows,
                    { title: '', youtubeUrl: '', duration: '', notes: '' },
                  ],
                })
              }
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-[#00D4FF]/50 px-3 py-1.5 text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Sub-Video Row
            </button>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingVideos}
                className="min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
              >
                {savingVideos
                  ? 'Saving Videos...'
                  : `Save ${multiVideoCourse.rows.length} Video${multiVideoCourse.rows.length > 1 ? 's' : ''}`}
              </button>
              <button
                type="button"
                onClick={() => setMultiVideoCourse(null)}
                className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Edit Single Sub-Video */}
      {editingLesson && (
        <form
          onSubmit={updateExistingLesson}
          noValidate
          className="rounded-xl border border-[#176BFF] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <h3 className="text-base font-bold">Edit Sub-Video: {editingLesson.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <input
                type="text"
                placeholder="Video Title *"
                value={editingLesson.title}
                onChange={(e) => {
                  setEditingLesson({ ...editingLesson, title: e.target.value });
                  setLessonErrors((p) => ({ ...p, title: '' }));
                }}
                aria-invalid={Boolean(lessonErrors.title)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  lessonErrors.title
                )}
              />
              <FieldError message={lessonErrors.title} />
            </div>
            <div>
              <input
                type="url"
                placeholder="YouTube URL *"
                value={editingLesson.youtubeUrl}
                onChange={(e) => {
                  setEditingLesson({ ...editingLesson, youtubeUrl: e.target.value });
                  setLessonErrors((p) => ({ ...p, youtubeUrl: '' }));
                }}
                aria-invalid={Boolean(lessonErrors.youtubeUrl)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  lessonErrors.youtubeUrl
                )}
              />
              <FieldError message={lessonErrors.youtubeUrl} />
            </div>
            <div>
              <input
                type="text"
                placeholder="Duration (e.g. 14:20)"
                value={editingLesson.duration}
                onChange={(e) => {
                  setEditingLesson({ ...editingLesson, duration: e.target.value });
                  setLessonErrors((p) => ({ ...p, duration: '' }));
                }}
                aria-invalid={Boolean(lessonErrors.duration)}
                className={fieldBorderClass(
                  'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                  lessonErrors.duration
                )}
              />
              <FieldError message={lessonErrors.duration} />
            </div>
          </div>
          <div>
            <textarea
              rows={2}
              placeholder="Sub-video notes..."
              value={editingLesson.notes}
              onChange={(e) => {
                setEditingLesson({ ...editingLesson, notes: e.target.value });
                setLessonErrors((p) => ({ ...p, notes: '' }));
              }}
              aria-invalid={Boolean(lessonErrors.notes)}
              className={fieldBorderClass(
                'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                lessonErrors.notes
              )}
            />
            <FieldError message={lessonErrors.notes} />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingLesson}
              className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
            >
              {savingLesson ? 'Updating...' : 'Update Sub-Video'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingLesson(null);
                setLessonErrors({});
              }}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {courses.length === 0 ? (
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-10 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          No courses created yet. Click &ldquo;New Course&rdquo; to create your first training programme.
        </div>
      ) : (
        <div className="space-y-6">
          {courses.map((course) => (
            <div
              key={course._id}
              className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-4">
                <div className="flex items-start gap-4 max-w-2xl">
                  <div className="hidden sm:block w-24 aspect-video rounded-lg overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] bg-[#03051B] shrink-0">
                    <MediaImage
                      src={course.coverImage}
                      alt={course.title}
                      fallbackLabel={course.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                      {course.published ? 'Published' : 'Draft'} · {course.currency} {course.price} ·{' '}
                      {course.lessonCount ?? 0} videos · {course.enrolmentsCount ?? 0} learners
                    </p>
                    <h2 className="mt-1 text-xl font-bold">{course.title}</h2>
                    {(course.fullDescription || course.shortDescription) && (
                      <p className="mt-1.5 text-xs text-[#4A5578] dark:text-[#AEB8D4] line-clamp-2">
                        {course.fullDescription || course.shortDescription}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openMultiVideoForm(course)}
                    className="min-h-[40px] inline-flex items-center gap-1 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Video className="w-3.5 h-3.5" />
                    + Add Sub-Videos
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublish(course)}
                    className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs font-medium"
                  >
                    {course.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {course.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCourseErrors({});
                      setEditingCourse(course);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs font-medium"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit Course
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ type: 'course', id: course._id, label: course.title })
                    }
                    className="min-h-[40px] inline-flex items-center gap-1 rounded-lg border border-red-500/40 text-red-500 px-3 py-1.5 text-xs font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>

              {/* Modules / Sections & Sub-Videos */}
              <div className="space-y-3">
                {(course.modules || []).map((mod) => (
                  <div
                    key={mod._id}
                    className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] p-4 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{mod.title}</h3>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openMultiVideoForm(course, mod._id)}
                          className="min-h-[36px] text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                        >
                          + Add Videos Here
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ type: 'module', id: mod._id, label: mod.title })
                          }
                          className="min-h-[36px] text-xs text-red-500 hover:underline"
                        >
                          Remove Section
                        </button>
                      </div>
                    </div>
                    {mod.lessons.length > 0 && (
                      <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550] text-xs">
                        {mod.lessons.map((l, idx) => (
                          <li
                            key={l._id}
                            className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3"
                          >
                            <span className="min-w-0 break-words">
                              <strong className="font-mono text-[#00D4FF] mr-1.5">
                                #{idx + 1}
                              </strong>
                              {l.title} {l.duration ? `(${l.duration})` : ''} —{' '}
                              <span className="font-mono text-[#4A5578] dark:text-[#AEB8D4] break-all">
                                {l.youtubeUrl || 'No YouTube URL'}
                              </span>
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditLesson(l)}
                                className="min-h-[36px] px-1 text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({ type: 'lesson', id: l._id, label: l.title })
                                }
                                className="min-h-[36px] px-1 text-red-500 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}

                <div className="space-y-1">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newModTitle[course._id] || ''}
                      onChange={(e) => {
                        setNewModTitle((p) => ({ ...p, [course._id]: e.target.value }));
                        setModErrors((p) => ({ ...p, [course._id]: '' }));
                      }}
                      placeholder="Optional new section/module title..."
                      aria-invalid={Boolean(modErrors[course._id])}
                      className={fieldBorderClass(
                        'flex-1 min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                        modErrors[course._id]
                      )}
                    />
                    <button
                      type="button"
                      disabled={addingModId === course._id}
                      onClick={() => addModule(course._id)}
                      className="min-h-[44px] rounded-lg border border-[#176BFF] text-[#176BFF] dark:text-[#00D4FF] disabled:opacity-60 px-4 py-2 text-xs font-semibold shrink-0"
                    >
                      {addingModId === course._id ? 'Adding...' : 'Add Section'}
                    </button>
                  </div>
                  <FieldError message={modErrors[course._id]} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.type}`}
        message={`Are you sure you want to permanently delete "${deleteTarget?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
