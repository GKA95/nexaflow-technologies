import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Eye, EyeOff, Star, Trash2, X } from 'lucide-react';
import { StarRatingDisplay, StarRatingPicker } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { CourseReviewItem } from '../../types';
import { apiFetch } from '../../utils/authSession';

interface CourseSummary {
  _id: string;
  title: string;
  slug: string;
}

export function AdminReviewsModule() {
  const { showToast, refreshBootstrap } = useApp();
  const [reviews, setReviews] = useState<CourseReviewItem[]>([]);
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [courseFilter, setCourseFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'published' | 'hidden'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [editingReview, setEditingReview] = useState<CourseReviewItem | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editTitle, setEditTitle] = useState('');
  const [editComment, setEditComment] = useState('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (courseFilter !== 'all') params.set('courseId', courseFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await apiFetch(`/api/admin/reviews?${params.toString()}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
        setCourses(data.courses || []);
      }
    } finally {
      setLoading(false);
    }
  }, [courseFilter, statusFilter]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  const handleToggleStatus = async (rev: CourseReviewItem) => {
    setBusyId(rev._id);
    const nextStatus = rev.status === 'published' ? 'hidden' : 'published';
    try {
      const res = await apiFetch(`/api/admin/reviews/${rev._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        showToast(
          nextStatus === 'published' ? 'Review published to course page.' : 'Review hidden.',
          'success'
        );
        await Promise.all([loadReviews(), refreshBootstrap()]);
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReview) return;
    setBusyId(editingReview._id);
    try {
      const res = await apiFetch(`/api/admin/reviews/${editingReview._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rating: editRating,
          title: editTitle,
          comment: editComment,
        }),
      });
      if (res.ok) {
        showToast('Course review updated.', 'success');
        setEditingReview(null);
        await Promise.all([loadReviews(), refreshBootstrap()]);
      } else {
        const d = await res.json().catch(() => ({}));
        showToast(d.error || 'Could not update review.', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await apiFetch(`/api/admin/reviews/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        showToast('Course review removed.', 'info');
        await Promise.all([loadReviews(), refreshBootstrap()]);
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Course Reviews &amp; Star Ratings</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Review, publish, hide, or remove learner star ratings submitted on NexaFlow Learn courses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
          >
            <option value="all">All Courses</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.title}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as 'all' | 'published' | 'hidden')
            }
            className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published Only</option>
            <option value="hidden">Hidden Only</option>
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">Loading course reviews...</p>
      ) : reviews.length === 0 ? (
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-10 text-center">
          <Star className="w-8 h-8 mx-auto text-amber-400 mb-3" />
          <p className="text-sm font-semibold">No course reviews found</p>
          <p className="mt-1 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
            Reviews submitted by enrolled learners inside the course classroom will appear here for moderation.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((rev) => {
            const courseObj =
              typeof rev.courseId === 'object' && rev.courseId ? rev.courseId : null;
            const userObj =
              typeof rev.userId === 'object' && rev.userId ? rev.userId : null;
            const isBusy = busyId === rev._id;

            return (
              <div
                key={rev._id}
                className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex flex-col md:flex-row md:items-start justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StarRatingDisplay rating={rev.rating} showEmptyLabel={false} size="xs" />
                    <span className="text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF]">
                      {courseObj?.title || 'Course'}
                    </span>
                    {rev.completedCourse && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Completed Course
                      </span>
                    )}
                    <span
                      className={`text-[11px] font-mono ${
                        rev.status === 'published'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {rev.status === 'published' ? 'Published' : 'Hidden'}
                    </span>
                  </div>

                  {rev.title && <h3 className="text-sm font-bold">{rev.title}</h3>}
                  <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                    {rev.comment}
                  </p>
                  <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                    <strong>{rev.authorName}</strong>
                    {userObj?.email ? ` (${userObj.email})` : ''} ·{' '}
                    {new Date(rev.createdAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleToggleStatus(rev)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    {rev.status === 'published' ? (
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
                    disabled={isBusy}
                    onClick={() => {
                      setEditingReview(rev);
                      setEditRating(rev.rating);
                      setEditTitle(rev.title || '');
                      setEditComment(rev.comment);
                    }}
                    className="inline-flex items-center gap-1 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDelete(rev._id)}
                    className="inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editingReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Edit Course Review</h2>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                  By {editingReview.authorName}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close review editor"
                onClick={() => setEditingReview(null)}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center text-[#4A5578] dark:text-[#AEB8D4] rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Star Rating</label>
                <StarRatingPicker value={editRating} onChange={setEditRating} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Headline</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Comment *</label>
                <textarea
                  required
                  rows={3}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingReview(null)}
                  className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId === editingReview._id}
                  className="min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
