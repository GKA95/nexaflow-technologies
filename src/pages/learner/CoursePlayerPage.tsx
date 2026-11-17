import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Lock,
  MessageSquare,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';
import { FieldError } from '../../components/FieldError';
import { ProtectedVideoPlayer } from '../../components/ProtectedVideoPlayer';
import { SEOHead } from '../../components/SEOHead';
import { StarRatingDisplay, StarRatingPicker } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { CourseItem, CourseReviewItem, LessonItem, ModuleItem } from '../../types';
import { apiFetch } from '../../utils/authSession';
import {
  courseReviewFormSchema,
  fieldBorderClass,
  type FieldErrors,
  validateWithSchema,
} from '../../utils/formValidation';

export function CoursePlayerPage({ slug }: { slug: string }) {
  const { user, authLoading, navigate, showToast } = useApp();
  const uid = useId();
  const [course, setCourse] = useState<CourseItem | null>(null);
  const [modules, setModules] = useState<ModuleItem[]>([]);
  const [activeLesson, setActiveLesson] = useState<LessonItem | null>(null);
  const [stats, setStats] = useState({ totalLessons: 0, completedCount: 0, percent: 0 });
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  // Course review state
  const [savedReview, setSavedReview] = useState<CourseReviewItem | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewErrors, setReviewErrors] = useState<FieldErrors>({});

  // Per-lesson authorized stream session state (never cached in syllabus JSON)
  const [streamVideoId, setStreamVideoId] = useState<string | null>(null);
  const [streamWatermark, setStreamWatermark] = useState<string>('');
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState('');

  const loadCourse = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/learner/courses/${encodeURIComponent(slug)}/learn`, {
        credentials: 'include',
      });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setCourse(data.course);
      setModules(data.modules || []);
      setStats(data.stats || { totalLessons: 0, completedCount: 0, percent: 0 });
      if (data.myReview) {
        setSavedReview(data.myReview);
        setReviewRating(Number(data.myReview.rating || 5));
        setReviewTitle(String(data.myReview.title || ''));
        setReviewComment(String(data.myReview.comment || ''));
      }

      const allLessons: LessonItem[] = (data.modules || []).flatMap(
        (m: ModuleItem) => m.lessons || []
      );
      if (allLessons.length > 0) {
        const firstIncomplete = allLessons.find((l) => !l.completed);
        setActiveLesson((prev) => {
          if (prev) {
            return allLessons.find((l) => l._id === prev._id) || firstIncomplete || allLessons[0];
          }
          return firstIncomplete || allLessons[0];
        });
      }
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/learner/courses/${slug}`)}`);
      return;
    }
    if (user) {
      loadCourse();
    }
  }, [authLoading, user, slug, navigate, loadCourse]);

  // Authorize ephemeral stream session whenever active sub-video changes
  useEffect(() => {
    if (!user || !course || !activeLesson) {
      setStreamVideoId(null);
      setStreamError('');
      return;
    }

    let cancelled = false;
    setStreamLoading(true);
    setStreamError('');
    setStreamVideoId(null);

    apiFetch(
      `/api/learner/courses/${encodeURIComponent(slug)}/lessons/${encodeURIComponent(activeLesson._id)}/stream-session`,
      {
        method: 'POST',
        credentials: 'include',
      }
    )
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          hasVideo?: boolean;
          payload?: string | null;
          watermark?: string;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setStreamError(data.error || 'Could not authorize video playback.');
          return;
        }
        setStreamWatermark(data.watermark || `${user.name} · ${user.email}`);
        if (!data.hasVideo || !data.payload) {
          setStreamVideoId(null);
          return;
        }
        try {
          const decoded = JSON.parse(atob(data.payload)) as { v?: string };
          setStreamVideoId(decoded.v || null);
        } catch {
          setStreamError('Invalid playback session response.');
        }
      })
      .catch(() => {
        if (!cancelled) setStreamError('Network error initializing video stream.');
      })
      .finally(() => {
        if (!cancelled) setStreamLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, course, activeLesson, slug]);

  const flatLessons = useMemo(
    () => modules.flatMap((m) => m.lessons || []),
    [modules]
  );

  const activeIndex = useMemo(
    () => (activeLesson ? flatLessons.findIndex((l) => l._id === activeLesson._id) : -1),
    [flatLessons, activeLesson]
  );

  const prevLesson = activeIndex > 0 ? flatLessons[activeIndex - 1] : null;
  const nextLesson =
    activeIndex >= 0 && activeIndex < flatLessons.length - 1
      ? flatLessons[activeIndex + 1]
      : null;

  const selectLesson = useCallback(
    (lesson: LessonItem) => {
      setActiveLesson(lesson);
      if (course) {
        apiFetch('/api/learner/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ courseId: course._id, lessonId: lesson._id }),
        }).catch(() => {});
      }
    },
    [course]
  );

  const toggleLessonComplete = async (lesson: LessonItem) => {
    if (!course) return;
    const nextState = !lesson.completed;
    const res = await apiFetch('/api/learner/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        courseId: course._id,
        lessonId: lesson._id,
        completed: nextState,
      }),
    });
    if (res.ok) {
      showToast(nextState ? 'Sub-video marked completed.' : 'Sub-video marked incomplete.', 'success');
      loadCourse();
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!course || reviewSubmitting) return;
    setReviewErrors({});

    const check = validateWithSchema(courseReviewFormSchema, {
      rating: reviewRating,
      title: reviewTitle,
      comment: reviewComment,
    });
    if (!check.ok) {
      setReviewErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }

    setReviewSubmitting(true);
    try {
      const res = await apiFetch(`/api/learner/courses/${encodeURIComponent(slug)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors && typeof data.fieldErrors === 'object') {
          setReviewErrors(data.fieldErrors as FieldErrors);
        }
        showToast(data.error || 'Could not submit course review.', 'error');
        return;
      }
      if (data.review) setSavedReview(data.review);
      showToast(
        savedReview ? 'Your course review has been updated.' : 'Thank you for reviewing this course!',
        'success'
      );
    } catch {
      showToast('Network error submitting review.', 'error');
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading course classroom...
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <Lock className="w-10 h-10 mx-auto text-[#00D4FF] mb-3" />
        <h1 className="text-2xl font-bold">Active Enrolment Required</h1>
        <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          Course video lessons are strictly restricted to learners with a verified active enrolment.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/learn/${slug}`)}
          className="mt-5 min-h-[44px] rounded-lg bg-[#176BFF] px-5 py-2.5 text-sm font-semibold text-white"
        >
          View Course &amp; Enrol
        </button>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-xl font-bold">Course Not Available</h1>
        <button
          type="button"
          onClick={() => navigate('/learner')}
          className="mt-4 min-h-[44px] inline-flex items-center text-sm text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  let runningVideoNumber = 0;

  return (
    <>
      <SEOHead
        title={`${course.title} | NexaFlow Classroom`}
        description={course.shortDescription}
        noIndex
      />

      <div
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6"
        onContextMenu={(e) => {
          if ((e.target as HTMLElement)?.closest('[data-protected-stage="true"]')) {
            e.preventDefault();
          }
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-5 border-b border-[#DCE3F2] dark:border-[#1A2550]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/learner')}
              className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#176BFF] shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </button>
            <span className="text-[#4A5578] dark:text-[#AEB8D4]">/</span>
            <h1 className="text-base sm:text-lg font-bold text-[#070B24] dark:text-[#F7F8FF] truncate">
              {course.title}
            </h1>
          </div>
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 text-xs tabular-nums">
            <span className="font-mono">
              {stats.completedCount}/{stats.totalLessons} videos ({stats.percent}%)
            </span>
            <button
              type="button"
              onClick={() => navigate('/learner?tab=support')}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3.5 py-2 font-medium hover:border-[#176BFF] whitespace-nowrap"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#00D4FF]" />
              Ask a Question
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Protected Video Stage + Course Overview */}
          <div className="lg:col-span-8 space-y-5 min-w-0" data-protected-stage="true">
            {activeLesson ? (
              <>
                <ProtectedVideoPlayer
                  videoId={streamVideoId}
                  title={activeLesson.title}
                  watermark={streamWatermark}
                  loadingSession={streamLoading}
                  sessionError={streamError}
                  hasPrev={Boolean(prevLesson)}
                  hasNext={Boolean(nextLesson)}
                  onPrev={() => prevLesson && selectLesson(prevLesson)}
                  onNext={() => nextLesson && selectLesson(nextLesson)}
                  onEnded={() => {
                    if (nextLesson) {
                      showToast(`Finished "${activeLesson.title}". Loading next video...`, 'info');
                      selectLesson(nextLesson);
                    }
                  }}
                />

                {/* Active Sub-Video Controls & Notes */}
                <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[#176BFF] dark:text-[#00D4FF]">
                        Video {activeIndex + 1} of {flatLessons.length}
                        {activeLesson.duration ? ` · ${activeLesson.duration}` : ''}
                      </p>
                      <h2 className="mt-0.5 text-lg sm:text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                        {activeLesson.title}
                      </h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {prevLesson && (
                        <button
                          type="button"
                          onClick={() => selectLesson(prevLesson)}
                          className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3.5 py-2 text-xs font-medium hover:border-[#176BFF] whitespace-nowrap"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          Previous
                        </button>
                      )}
                      {nextLesson && (
                        <button
                          type="button"
                          onClick={() => selectLesson(nextLesson)}
                          className="min-h-[44px] inline-flex items-center gap-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3.5 py-2 text-xs font-medium hover:border-[#176BFF] whitespace-nowrap"
                        >
                          Next Video
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleLessonComplete(activeLesson)}
                        className={`min-h-[44px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          activeLesson.completed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-[#176BFF] hover:bg-[#0F56D6] text-white'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        {activeLesson.completed ? 'Completed' : 'Mark Completed'}
                      </button>
                    </div>
                  </div>

                  {activeLesson.notes && (
                    <div className="mt-4 pt-4 border-t border-[#DCE3F2] dark:border-[#1A2550] text-sm text-[#4A5578] dark:text-[#AEB8D4] whitespace-pre-line leading-relaxed">
                      {activeLesson.notes}
                    </div>
                  )}

                  <div className="mt-5 pt-3 border-t border-[#DCE3F2] dark:border-[#1A2550] flex items-start gap-2 text-xs text-[#4A5578] dark:text-[#AEB8D4]/80">
                    <ShieldCheck className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
                    <span>
                      Protected on-platform playback: video downloads, context-menu link copying, external player escapes, and automated downloaders are disabled for this classroom stream.
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                No published videos in this course yet.
              </div>
            )}

            {/* One Big Main Course Description */}
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6 space-y-4">
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-[#00D4FF]">
                  Course Overview
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  About {course.title}
                </h2>
              </div>

              {course.shortDescription && (
                <p className="text-sm font-medium text-[#070B24] dark:text-[#F7F8FF]/90 leading-relaxed">
                  {course.shortDescription}
                </p>
              )}

              {course.fullDescription && (
                <div className="text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed whitespace-pre-line">
                  {course.fullDescription}
                </div>
              )}

              {(course.objectives?.length > 0 || course.outcomes?.length > 0) && (
                <div className="pt-4 border-t border-[#DCE3F2] dark:border-[#1A2550] grid grid-cols-1 md:grid-cols-2 gap-6">
                  {course.objectives?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#070B24] dark:text-[#F7F8FF] mb-2">
                        Course Objectives
                      </h3>
                      <ul className="space-y-1.5 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                        {course.objectives.map((o) => (
                          <li key={o} className="flex items-start gap-2">
                            <span className="text-[#00D4FF] mt-0.5">•</span>
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {course.outcomes?.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#070B24] dark:text-[#F7F8FF] mb-2">
                        Learning Outcomes
                      </h3>
                      <ul className="space-y-1.5 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                        {course.outcomes.map((o) => (
                          <li key={o} className="flex items-start gap-2">
                            <span className="text-[#176BFF] mt-0.5">•</span>
                            <span>{o}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Course Star Rating & Learner Review */}
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6 space-y-4">
              {stats.percent === 100 && (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 flex items-start gap-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                  <Award className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Course Completed!</strong> You&apos;ve finished all videos in this course. Share your star rating and review below to help future learners.
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-mono uppercase tracking-wider text-[#00D4FF]">
                    Course Feedback
                  </p>
                  <h2 className="mt-0.5 text-lg font-bold text-[#070B24] dark:text-[#F7F8FF]">
                    {savedReview ? 'Your Course Review' : 'Rate & Review This Course'}
                  </h2>
                </div>
                {savedReview && (
                  <StarRatingDisplay
                    rating={savedReview.rating}
                    showEmptyLabel={false}
                    size="sm"
                  />
                )}
              </div>

              <form onSubmit={handleSubmitReview} noValidate className="space-y-4">
                <div>
                  <span className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
                    Star Rating *
                  </span>
                  <StarRatingPicker
                    value={reviewRating}
                    onChange={(r) => {
                      setReviewRating(r);
                      setReviewErrors((p) => ({ ...p, rating: '' }));
                    }}
                    disabled={reviewSubmitting}
                  />
                  <FieldError error={reviewErrors.rating} />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-rtitle`}
                    className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                  >
                    Review Headline (Optional)
                  </label>
                  <input
                    id={`${uid}-rtitle`}
                    aria-invalid={Boolean(reviewErrors.title)}
                    value={reviewTitle}
                    onChange={(e) => {
                      setReviewTitle(e.target.value);
                      setReviewErrors((p) => ({ ...p, title: '' }));
                    }}
                    maxLength={140}
                    placeholder="e.g., Clear practical walkthrough of automation pipelines"
                    className={fieldBorderClass(
                      'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]',
                      reviewErrors.title
                    )}
                  />
                  <FieldError error={reviewErrors.title} />
                </div>

                <div>
                  <label
                    htmlFor={`${uid}-rcomment`}
                    className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                  >
                    Your Review *
                  </label>
                  <textarea
                    id={`${uid}-rcomment`}
                    required
                    minLength={3}
                    maxLength={2000}
                    rows={3}
                    aria-invalid={Boolean(reviewErrors.comment)}
                    value={reviewComment}
                    onChange={(e) => {
                      setReviewComment(e.target.value);
                      setReviewErrors((p) => ({ ...p, comment: '' }));
                    }}
                    placeholder="What did you find most helpful in this course?"
                    className={fieldBorderClass(
                      'w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]',
                      reviewErrors.comment
                    )}
                  />
                  <FieldError error={reviewErrors.comment} />
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                    {savedReview
                      ? `Last submitted on ${new Date(savedReview.createdAt).toLocaleDateString()}`
                      : 'Reviews appear publicly on the course page.'}
                  </span>
                  <button
                    type="submit"
                    disabled={reviewSubmitting}
                    className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-50 px-5 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    {reviewSubmitting
                      ? 'Submitting...'
                      : savedReview
                        ? 'Update Review'
                        : 'Submit Review'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sub-Videos Playlist Sidebar */}
          <aside className="lg:col-span-4 space-y-4">
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-[#070B24] dark:text-[#F7F8FF]">
                Course Videos ({flatLessons.length})
              </span>
              <span className="text-xs font-mono text-[#00D4FF]">{stats.percent}% done</span>
            </div>

            {modules.map((mod, mIdx) => (
              <div
                key={mod._id}
                className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden"
              >
                {modules.length > 1 && (
                  <div className="px-4 py-3 border-b border-[#DCE3F2] dark:border-[#1A2550] bg-[#EEF2FA]/50 dark:bg-[#10183A]/60">
                    <p className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                      Section {mIdx + 1}
                    </p>
                    <h3 className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                      {mod.title}
                    </h3>
                  </div>
                )}
                <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                  {mod.lessons.map((lesson) => {
                    runningVideoNumber += 1;
                    const videoNum = runningVideoNumber;
                    const isActive = activeLesson?._id === lesson._id;
                    return (
                      <li key={lesson._id}>
                        <button
                          type="button"
                          onClick={() => selectLesson(lesson)}
                          className={`w-full min-h-[52px] text-left px-4 py-3 flex items-start gap-2.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-[#176BFF]/10 text-[#176BFF] dark:text-[#00D4FF] font-medium'
                              : 'hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]'
                          }`}
                        >
                          {lesson.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : isActive ? (
                            <PlayCircle className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-4 h-4 text-[#4A5578] dark:text-[#AEB8D4] shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                              Video {videoNum}
                              {lesson.duration ? ` · ${lesson.duration}` : ''}
                            </p>
                            <p className="leading-snug">{lesson.title}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </aside>
        </div>
      </div>
    </>
  );
}
