import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Lock, PlayCircle } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { CouponApplyBar } from '../../components/CouponApplyBar';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { StarRatingDisplay } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { CourseItem, CourseReviewItem, ModuleItem } from '../../types';
import { trackEvent } from '../../utils/analytics';
import { apiFetch } from '../../utils/authSession';
import { normalizeImageUrl } from '../../utils/media';
import { formatMoneyAmount, getCourseDiscountPricing } from '../../utils/pricing';

export function CourseDetailPage({ slug }: { slug: string }) {
  const { user, navigate, showToast, consent, appliedCoupon, clearAppliedCoupon } = useApp();
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

    const pricing = getCourseDiscountPricing(course, appliedCoupon);
    const activeCouponCode = pricing.applies && appliedCoupon ? appliedCoupon.code : undefined;

    const completeFreeEnrolment = async (couponCodeUsed?: string) => {
      const res = await apiFetch('/api/learner/enrol-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseId: course._id,
          ...(couponCodeUsed ? { couponCode: couponCodeUsed } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not complete enrolment.', 'error');
        return;
      }
      if (couponCodeUsed) clearAppliedCoupon();
      showToast('Enrolment activated!', 'success');
      trackEvent('enrolment_complete', {
        entitySlug: course.slug,
        consentAccepted: consent === 'accepted',
      });
      navigate(`/learner/courses/${course.slug}`);
    };

    setEnrolling(true);
    try {
      if (pricing.finalPrice <= 0) {
        await completeFreeEnrolment(activeCouponCode);
        return;
      }

      const res = await apiFetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          courseId: course._id,
          ...(activeCouponCode ? { couponCode: activeCouponCode } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok && data.freeWithCoupon) {
        await completeFreeEnrolment(activeCouponCode);
        return;
      }
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
        <AppLink
          to="/learn"
          className="mt-4 inline-flex items-center text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Course Catalogue
        </AppLink>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const courseCanonical = `${origin}/learn/${course.slug}`;
  const rawCover = normalizeImageUrl(course.ogImage || course.coverImage);
  const resolvedCover = rawCover
    ? /^https?:\/\//i.test(rawCover)
      ? rawCover
      : `${origin}${rawCover.startsWith('/') ? '' : '/'}${rawCover}`
    : `${origin}/og-image.png`;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: course.seoDescription || course.shortDescription,
      url: courseCanonical,
      image: resolvedCover,
      inLanguage: 'en',
      provider: {
        '@type': 'Organization',
        name: 'NexaFlow Technologies',
        url: origin,
        sameAs: origin,
      },
      offers: {
        '@type': 'Offer',
        price: course.price,
        priceCurrency: course.currency || 'GHS',
        availability: 'https://schema.org/InStock',
        url: courseCanonical,
      },
      ...(course.ratingsEnabled !== false && (course.reviewCount || 0) > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: course.averageRating,
              reviewCount: course.reviewCount,
              bestRating: 5,
              worstRating: 1,
            },
          }
        : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Learn', item: `${origin}/learn` },
        { '@type': 'ListItem', position: 3, name: course.title, item: courseCanonical },
      ],
    },
  ];

  const pricing = getCourseDiscountPricing(course, appliedCoupon);

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

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-12 sm:py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AppLink
            to="/learn"
            className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-medium text-[#AEB8D4] hover:text-[#00D4FF] mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Courses
          </AppLink>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="text-xs text-[#00D4FF] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums mb-2">
                <span>{course.moduleCount ?? 0} Modules</span>
                <span aria-hidden="true">·</span>
                <span>{course.lessonCount ?? 0} Lessons</span>
                <span aria-hidden="true">·</span>
                {course.price > 0 ? (
                  pricing.applies ? (
                    <span className="inline-flex items-center gap-2 font-mono font-semibold">
                      <span className="line-through text-[#AEB8D4]/70">
                        {course.currency} {formatMoneyAmount(pricing.originalPrice)}
                      </span>
                      <span className="text-emerald-400">
                        {pricing.finalPrice <= 0
                          ? 'Free (100% Off)'
                          : `${course.currency} ${formatMoneyAmount(pricing.finalPrice)} (${pricing.discountPercent}% Off)`}
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono font-semibold">
                      {course.currency} {course.price}
                    </span>
                  )
                ) : (
                  <span className="font-mono font-semibold">Free</span>
                )}
              </div>
              <h1 className="text-[clamp(1.75rem,4vw,3rem)] font-bold tracking-tight">
                {course.title}
              </h1>
              {course.ratingsEnabled !== false && (
                <div className="mt-3">
                  <StarRatingDisplay
                    rating={course.averageRating}
                    count={course.reviewCount}
                    size="sm"
                    className="[&_span]:text-[#F7F8FF]"
                  />
                </div>
              )}
              <p className="mt-4 text-base sm:text-lg text-[#AEB8D4] leading-relaxed">
                {course.shortDescription}
              </p>

              {course.price > 0 && !enrolledAlready && (
                <div className="mt-6">
                  <CouponApplyBar courseId={course._id} variant="dark" compact />
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={enrolling}
                  onClick={handleEnrol}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-6 py-3 text-sm font-semibold text-white transition-colors"
                >
                  {enrolledAlready
                    ? 'Go to Course Player'
                    : enrolling
                      ? 'Preparing Enrolment...'
                      : pricing.finalPrice > 0
                        ? `Enrol Now (${course.currency} ${formatMoneyAmount(pricing.finalPrice)})`
                        : pricing.applies
                          ? 'Enrol Free With Coupon'
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
              <div className="h-full min-h-[220px] sm:min-h-[240px] rounded-xl overflow-hidden border border-[#1A2550]">
                <MediaImage
                  src={course.coverImage}
                  alt={course.title}
                  fallbackLabel={course.title}
                  loading="eager"
                  fetchPriority="high"
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
            {course.ratingsEnabled !== false && (
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
            )}
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
