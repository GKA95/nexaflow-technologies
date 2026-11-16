import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, Eye, EyeOff, Plus, Trash2, Video } from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useApp } from '../../context/AppContext';
import type { CourseItem, LessonItem } from '../../types';
import { apiFetch } from '../../utils/authSession';

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

  const saveCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    const isNew = !editingCourse._id;
    const res = await apiFetch(
      isNew ? '/api/admin/courses' : `/api/admin/courses/${editingCourse._id}`,
      {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editingCourse),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to save course.', 'error');
      return;
    }
    showToast(isNew ? 'Course created.' : 'Course updated.', 'success');
    setEditingCourse(null);
    loadCourses();
    refreshBootstrap();
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
    const title = (newModTitle[courseId] || '').trim();
    if (!title) return;
    const res = await apiFetch(`/api/admin/courses/${courseId}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      setNewModTitle((p) => ({ ...p, [courseId]: '' }));
      loadCourses();
      showToast('Section/module added.', 'success');
    }
  };

  const openMultiVideoForm = (course: CourseItem, preselectModuleId = '') => {
    const mods = (course.modules || []).map((m) => ({ _id: m._id, title: m.title }));
    setEditingLesson(null);
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
    if (!multiVideoCourse) return;
    setSavingVideos(true);
    try {
      const res = await apiFetch(`/api/admin/courses/${multiVideoCourse.courseId}/lessons/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          moduleId: multiVideoCourse.moduleId || undefined,
          lessons: multiVideoCourse.rows,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        showToast(d.error || 'Could not add sub-videos.', 'error');
        return;
      }
      showToast(`${multiVideoCourse.rows.length} sub-video(s) added to course.`, 'success');
      setMultiVideoCourse(null);
      loadCourses();
      refreshBootstrap();
    } finally {
      setSavingVideos(false);
    }
  };

  const updateExistingLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson) return;
    const res = await apiFetch(`/api/admin/lessons/${editingLesson._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        title: editingLesson.title,
        youtubeUrl: editingLesson.youtubeUrl,
        duration: editingLesson.duration,
        notes: editingLesson.notes,
        order: editingLesson.order,
      }),
    });
    const d = await res.json();
    if (!res.ok) {
      showToast(d.error || 'Failed to update video lesson.', 'error');
      return;
    }
    showToast('Sub-video updated.', 'success');
    setEditingLesson(null);
    loadCourses();
    refreshBootstrap();
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
          onClick={() =>
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
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
        >
          <Plus className="w-4 h-4" />
          New Course
        </button>
      </div>

      {editingCourse && (
        <form
          onSubmit={saveCourse}
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
                required
                value={editingCourse.title || ''}
                onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Slug (auto if blank)</label>
              <input
                type="text"
                value={editingCourse.slug || ''}
                onChange={(e) => setEditingCourse({ ...editingCourse, slug: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
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
                onChange={(e) => setEditingCourse({ ...editingCourse, price: Number(e.target.value) })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Currency</label>
              <input
                type="text"
                value={editingCourse.currency || 'GHS'}
                onChange={(e) => setEditingCourse({ ...editingCourse, currency: e.target.value })}
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Cover Image URL</label>
              <input
                type="text"
                value={editingCourse.coverImage || ''}
                onChange={(e) => setEditingCourse({ ...editingCourse, coverImage: e.target.value })}
                placeholder="/assets/images/..."
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Short Summary *</label>
            <textarea
              rows={2}
              required
              value={editingCourse.shortDescription || ''}
              onChange={(e) =>
                setEditingCourse({ ...editingCourse, shortDescription: e.target.value })
              }
              placeholder="Concise summary shown on course catalogue cards and hero banner"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Main Course Description (Full Overview for All Sub-Videos)
            </label>
            <textarea
              rows={5}
              value={editingCourse.fullDescription || ''}
              onChange={(e) =>
                setEditingCourse({ ...editingCourse, fullDescription: e.target.value })
              }
              placeholder="Write the comprehensive overview covering the entire course and all video lessons inside it..."
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
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

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
            >
              Save Course
            </button>
            <button
              type="button"
              onClick={() => setEditingCourse(null)}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
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
                      onClick={() =>
                        setMultiVideoCourse({
                          ...multiVideoCourse,
                          rows: multiVideoCourse.rows.filter((_, rIdx) => rIdx !== idx),
                        })
                      }
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove Row
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    type="text"
                    required
                    placeholder="Video Title *"
                    value={row.title}
                    onChange={(e) => {
                      const next = [...multiVideoCourse.rows];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                    }}
                    className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
                  />
                  <input
                    type="url"
                    required
                    placeholder="Unlisted YouTube URL (https://youtu.be/...) *"
                    value={row.youtubeUrl}
                    onChange={(e) => {
                      const next = [...multiVideoCourse.rows];
                      next[idx] = { ...next[idx], youtubeUrl: e.target.value };
                      setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                    }}
                    className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Duration (e.g. 14:20)"
                    value={row.duration}
                    onChange={(e) => {
                      const next = [...multiVideoCourse.rows];
                      next[idx] = { ...next[idx], duration: e.target.value };
                      setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                    }}
                    className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Optional sub-video notes..."
                  value={row.notes}
                  onChange={(e) => {
                    const next = [...multiVideoCourse.rows];
                    next[idx] = { ...next[idx], notes: e.target.value };
                    setMultiVideoCourse({ ...multiVideoCourse, rows: next });
                  }}
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-xs"
                />
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#00D4FF]/50 px-3 py-1.5 text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF]"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Sub-Video Row
            </button>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingVideos}
                className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white"
              >
                {savingVideos
                  ? 'Saving Videos...'
                  : `Save ${multiVideoCourse.rows.length} Video${multiVideoCourse.rows.length > 1 ? 's' : ''}`}
              </button>
              <button
                type="button"
                onClick={() => setMultiVideoCourse(null)}
                className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs"
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
          className="rounded-xl border border-[#176BFF] bg-white dark:bg-[#080D2B] p-6 space-y-4"
        >
          <h3 className="text-base font-bold">Edit Sub-Video: {editingLesson.title}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <input
              type="text"
              required
              placeholder="Video Title *"
              value={editingLesson.title}
              onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
              className="sm:col-span-2 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              type="url"
              required
              placeholder="YouTube URL *"
              value={editingLesson.youtubeUrl}
              onChange={(e) => setEditingLesson({ ...editingLesson, youtubeUrl: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
            <input
              type="text"
              placeholder="Duration (e.g. 14:20)"
              value={editingLesson.duration}
              onChange={(e) => setEditingLesson({ ...editingLesson, duration: e.target.value })}
              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
          <textarea
            rows={2}
            placeholder="Sub-video notes..."
            value={editingLesson.notes}
            onChange={(e) => setEditingLesson({ ...editingLesson, notes: e.target.value })}
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white">
              Update Sub-Video
            </button>
            <button
              type="button"
              onClick={() => setEditingLesson(null)}
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
                <div className="max-w-2xl">
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
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openMultiVideoForm(course)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Video className="w-3.5 h-3.5" />
                    + Add Sub-Videos
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePublish(course)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs font-medium"
                  >
                    {course.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {course.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingCourse(course)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs font-medium"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit Course
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ type: 'course', id: course._id, label: course.title })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 text-red-500 px-3 py-1.5 text-xs font-medium"
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
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{mod.title}</h3>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openMultiVideoForm(course, mod._id)}
                          className="text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                        >
                          + Add Videos Here
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ type: 'module', id: mod._id, label: mod.title })
                          }
                          className="text-xs text-red-500 hover:underline"
                        >
                          Remove Section
                        </button>
                      </div>
                    </div>
                    {mod.lessons.length > 0 && (
                      <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550] text-xs">
                        {mod.lessons.map((l, idx) => (
                          <li key={l._id} className="py-2 flex items-center justify-between gap-3">
                            <span className="min-w-0">
                              <strong className="font-mono text-[#00D4FF] mr-1.5">
                                #{idx + 1}
                              </strong>
                              {l.title} {l.duration ? `(${l.duration})` : ''} —{' '}
                              <span className="font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                                {l.youtubeUrl || 'No YouTube URL'}
                              </span>
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditLesson(l)}
                                className="text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteTarget({ type: 'lesson', id: l._id, label: l.title })
                                }
                                className="text-red-500 hover:underline"
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

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newModTitle[course._id] || ''}
                    onChange={(e) =>
                      setNewModTitle((p) => ({ ...p, [course._id]: e.target.value }))
                    }
                    placeholder="Optional new section/module title..."
                    className="flex-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => addModule(course._id)}
                    className="rounded-lg border border-[#176BFF] text-[#176BFF] dark:text-[#00D4FF] px-3 py-1.5 text-xs font-semibold"
                  >
                    Add Section
                  </button>
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
