import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Lock, PlayCircle } from 'lucide-react';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { StarRatingDisplay } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { CourseItem, CourseReviewItem, ModuleItem } from '../../types';
import { trackEvent } from '../../utils/analytics';
import { apiFetch } from '../../utils/authSession';

export function CourseDetailPage({ slug }: { slug: string }) {
  const { user, navigate, showToast, consent } = useApp();
  const [course, setCourse] = useState<CourseItem | null>(null);
  const [curriculum, setCurriculum] = useState<ModuleItem[]>([]);
  const [reviews, setReviews] = useState<CourseReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrolledAlready, setEnrolledAlready] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/courses/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.course) {
          setCourse(data.course);
          setCurriculum(data.curriculum || []);
          setReviews(data.reviews || []);
          trackEvent('course_view', {
            entitySlug: data.course.slug,
            consentAccepted: consent === 'accepted',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [slug, consent]);

  useEffect(() => {
    if (!user || !course) return;
    apiFetch('/api/learner/dashboard', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = (d?.courses || []) as Array<{ course: { _id: string } }>;
        if (list.some((item) => String(item.course?._id) === String(course._id))) {
          setEnrolledAlready(true);
        }
      })
      .catch(() => {});
  }, [user, course]);

  const handleEnrol = async () => {
    if (!course) return;
    trackEvent('enrol_cta_click', {
      entitySlug: course.slug,
      consentAccepted: consent === 'accepted',
    });

    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/learn/${course.slug}`)}`);
      return;
    }

    if (enrolledAlready) {
      navigate(`/learner/courses/${course.slug}`);
      return;
    }

    setEnrolling(true);
    try {
      if (course.price <= 0) {
        const res = await apiFetch('/api/learner/enrol-free', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ courseId: course._id }),
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || 'Could not complete enrolment.', 'error');
          return;
        }
        showToast('Enrolment activated!', 'success');
        trackEvent('enrolment_complete', {
          entitySlug: course.slug,
          consentAccepted: consent === 'accepted',
        });
        navigate(`/learner/courses/${course.slug}`);
        return;
      }

      const res = await apiFetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courseId: course._id }),
      });
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) {
        showToast(data.error || 'Unable to start Paystack checkout.', 'error');
        return;
      }

      window.location.href = data.authorizationUrl;
    } catch {
      showToast('Network error starting enrolment.', 'error');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading course details...
      </div>
    );
  }

  if (!course) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Course Not Found</h1>
        <button
          type="button"
          onClick={() => navigate('/learn')}
          className="mt-4 text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Course Catalogue
        </button>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.shortDescription,
    provider: {
      '@type': 'Organization',
      name: 'NexaFlow Technologies',
      sameAs: origin,
    },
    offers: {
      '@type': 'Offer',
      price: course.price,
      priceCurrency: course.currency || 'GHS',
    },
    ...((course.reviewCount || 0) > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: course.averageRating,
            reviewCount: course.reviewCount,
          },
        }
      : {}),
  };

  return (
    <>
      <SEOHead
        title={course.seoTitle || `${course.title} | NexaFlow Learn`}
        description={course.seoDescription || course.shortDescription}
        canonicalUrl={course.canonicalUrl}
        ogImage={course.ogImage || course.coverImage}
        keywords={course.focusKeyword}
        noIndex={course.noIndex}
        structuredData={structuredData}
      />

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/learn')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AEB8D4] hover:text-[#00D4FF] mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Courses
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="text-xs text-[#00D4FF] flex items-center gap-2 tabular-nums mb-2">
                <span>{course.moduleCount ?? 0} Modules</span>
                <span aria-hidden="true">·</span>
                <span>{course.lessonCount ?? 0} Lessons</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono font-semibold">
                  {course.price > 0 ? `${course.currency} ${course.price}` : 'Free'}
                </span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">{course.title}</h1>
              <div className="mt-3">
                <StarRatingDisplay
                  rating={course.averageRating}
                  count={course.reviewCount}
                  size="sm"
                  className="[&_span]:text-[#F7F8FF]"
                />
              </div>
              <p className="mt-4 text-base sm:text-lg text-[#AEB8D4] leading-relaxed">
                {course.shortDescription}
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={enrolling}
                  onClick={handleEnrol}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-6 py-3 text-sm font-semibold text-white transition-colors"
                >
                  {enrolledAlready
                    ? 'Go to Course Player'
                    : enrolling
                      ? 'Preparing Enrolment...'
                      : course.price > 0
                        ? `Enrol Now (${course.currency} ${course.price})`
                        : 'Enrol for Free'}
                </button>
                {!user && (
                  <span className="text-xs text-[#AEB8D4]">
                    Learners sign in or create an account before checkout.
                  </span>
                )}
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[240px] rounded-xl overflow-hidden border border-[#1A2550]">
                <MediaImage
                  src={course.coverImage}
                  alt={course.title}
                  fallbackLabel={course.title}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-10">
            {course.fullDescription && (
              <div>
                <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Course Overview
                </h2>
                <p className="mt-3 text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed whitespace-pre-line">
                  {course.fullDescription}
                </p>
              </div>
            )}

            {course.objectives?.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Course Objectives
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {course.objectives.map((o) => (
                    <li key={o} className="flex items-start gap-3 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                      <Check className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {course.outcomes?.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Expected Learning Outcomes
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {course.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-3 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                      <Check className="w-4 h-4 text-[#176BFF] shrink-0 mt-0.5" />
                      <span>{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                Course Videos &amp; Curriculum
              </h2>
              {curriculum.length === 0 ? (
                <p className="mt-3 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  Course videos will appear here once published.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {(() => {
                    let videoCounter = 0;
                    return curriculum.map((mod, mIdx) => (
                      <div
                        key={mod._id}
                        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden"
                      >
                        <div className="px-5 py-4 border-b border-[#DCE3F2] dark:border-[#1A2550] flex items-center justify-between gap-4">
                          <div>
                            {curriculum.length > 1 && (
                              <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                                Section {mIdx + 1}
                              </p>
                            )}
                            <h3 className="text-base font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                              {mod.title}
                            </h3>
                          </div>
                          <span className="text-xs text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
                            {mod.lessons.length} {mod.lessons.length === 1 ? 'video' : 'videos'}
                          </span>
                        </div>
                        <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                          {mod.lessons.map((lesson) => {
                            videoCounter += 1;
                            const num = videoCounter;
                            return (
                              <li
                                key={lesson._id}
                                className="px-5 py-3 flex items-center justify-between gap-3 text-sm"
                              >
                                <span className="flex items-center gap-2.5 text-[#070B24] dark:text-[#F7F8FF]">
                                  {enrolledAlready ? (
                                    <PlayCircle className="w-4 h-4 text-[#00D4FF] shrink-0" />
                                  ) : (
                                    <Lock className="w-4 h-4 text-[#4A5578] dark:text-[#AEB8D4] shrink-0" />
                                  )}
                                  <span className="font-mono text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                                    Video {num}:
                                  </span>
                                  <span>{lesson.title}</span>
                                </span>
                                {lesson.duration && (
                                  <span className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
                                    {lesson.duration}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            {/* Learner Reviews & Star Ratings */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Learner Reviews &amp; Ratings
                </h2>
                <StarRatingDisplay
                  rating={course.averageRating}
                  count={course.reviewCount}
                  size="sm"
                />
              </div>

              {reviews.length === 0 ? (
                <div className="mt-4 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  No reviews have been submitted for this course yet. Enrolled learners can leave a star rating and review inside the classroom after watching the videos.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
                    <div className="sm:col-span-4 text-center sm:border-r border-[#DCE3F2] dark:border-[#1A2550] sm:pr-4">
                      <p className="text-4xl font-bold font-mono tabular-nums text-[#070B24] dark:text-[#F7F8FF]">
                        {(course.averageRating || 0).toFixed(1)}
                      </p>
                      <div className="mt-1 flex justify-center">
                        <StarRatingDisplay
                          rating={course.averageRating}
                          showEmptyLabel={false}
                          size="sm"
                        />
                      </div>
                      <p className="mt-1 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                        {reviews.length} {reviews.length === 1 ? 'learner review' : 'learner reviews'}
                      </p>
                    </div>

                    <div className="sm:col-span-8 space-y-1.5">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const starCount = reviews.filter((r) => Math.round(r.rating) === star).length;
                        const pct = reviews.length > 0 ? Math.round((starCount / reviews.length) * 100) : 0;
                        return (
                          <div key={star} className="flex items-center gap-2.5 text-xs">
                            <span className="w-8 font-mono text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
                              {star}★
                            </span>
                            <div className="flex-1 h-2 rounded-full bg-[#EEF2FA] dark:bg-[#10183A] overflow-hidden">
                              <div
                                className="h-full bg-amber-400 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-8 text-right font-mono text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
                              {starCount}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {reviews.map((rev) => (
                      <article
                        key={rev._id}
                        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <StarRatingDisplay
                              rating={rev.rating}
                              showEmptyLabel={false}
                              size="xs"
                            />
                            {rev.completedCourse && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Verified Completion
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                            {new Date(rev.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {rev.title && (
                          <h3 className="mt-2 text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                            {rev.title}
                          </h3>
                        )}
                        <p className="mt-1.5 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                          {rev.comment}
                        </p>
                        <p className="mt-2.5 text-xs font-medium text-[#070B24] dark:text-[#F7F8FF]">
                          — {rev.authorName}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5">
            <LeadForm
              interestType="course"
              interestSlug={course.slug}
              interestName={course.title}
              showCompany={false}
              heading="Questions About This Course?"
              subheading="Ask about prerequisites, group enrolments, or syllabus details."
            />
          </div>
        </div>
      </section>
    </>
  );
}
