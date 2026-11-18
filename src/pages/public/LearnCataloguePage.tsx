import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Search, X } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { CouponApplyBar } from '../../components/CouponApplyBar';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { StarRatingDisplay } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { CourseItem } from '../../types';
import { formatMoneyAmount, getCourseDiscountPricing } from '../../utils/pricing';

export function LearnCataloguePage() {
  const { seoPages, appliedCoupon, searchParams } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'learn');
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const urlQuery = searchParams.get('q') || '';
  const [searchQuery, setSearchQuery] = useState(urlQuery);

  useEffect(() => {
    setSearchQuery(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    fetch('/api/public/courses')
      .then((r) => r.json())
      .then((d) => setCourses(d.courses || []))
      .finally(() => setLoading(false));
  }, []);

  const filteredCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => {
      const hay = [c.title, c.shortDescription, c.fullDescription, c.focusKeyword]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [courses, searchQuery]);

  return (
    <>
      <SEOHead
        title={seo?.title}
        description={seo?.description}
        canonicalUrl={seo?.canonicalUrl}
        ogTitle={seo?.ogTitle}
        ogDescription={seo?.ogDescription}
        ogImage={seo?.ogImage}
        keywords={seo?.focusKeyword}
        noIndex={seo?.noIndex}
      />

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
            NexaFlow Learn
          </p>
          <h1 className="mt-3 text-[clamp(1.8rem,4.2vw,3rem)] font-bold tracking-tight max-w-3xl">
            Structured Courses for Practitioners &amp; Teams
          </h1>
          <p className="mt-4 text-base text-[#AEB8D4] max-w-2xl leading-relaxed">
            Enrol in guided video courses with module progress tracking, learner support tickets, and verified online payments.
          </p>
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-7">
              <CouponApplyBar variant="dark" compact />
            </div>
            <div className="lg:col-span-5">
              <label htmlFor="learn-catalogue-search" className="sr-only">
                Search courses
              </label>
              <div className="relative flex items-center">
                <Search
                  className="w-4 h-4 text-[#00D4FF] absolute left-3.5 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="learn-catalogue-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search courses by topic or keyword..."
                  className="w-full min-h-[44px] rounded-xl border border-[#1A2550] bg-[#080D2B] pl-10 pr-10 py-2.5 text-sm text-[#F7F8FF] placeholder-[#8C98BD] focus:outline-none focus:border-[#00D4FF]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear course search"
                    className="absolute right-2 min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg text-[#AEB8D4] hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-72 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] animate-pulse"
                />
              ))}
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 sm:p-12 text-center max-w-2xl mx-auto">
              <BookOpen className="w-8 h-8 mx-auto text-[#176BFF] dark:text-[#00D4FF] mb-3" />
              <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                No courses published yet
              </h2>
              <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                New training programmes are published directly from the NexaFlow Learn portal. If your organisation requires custom training, use the enquiry form below.
              </p>
            </div>
          ) : filteredCourses.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 sm:p-10 text-center max-w-2xl mx-auto">
              <Search className="w-7 h-7 mx-auto text-[#176BFF] dark:text-[#00D4FF] mb-3" />
              <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                No matching courses found
              </h2>
              <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                No published courses matched &ldquo;{searchQuery.trim()}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-4 min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-sm font-medium hover:bg-[#EEF2FA] dark:hover:bg-[#10183A]"
              >
                Show All Courses
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCourses.map((course) => {
                const pricing = getCourseDiscountPricing(course, appliedCoupon);
                return (
                  <article
                    key={course.slug}
                    className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-video bg-[#03051B]">
                        <MediaImage
                          src={course.coverImage}
                          alt={course.title}
                          fallbackLabel={course.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="p-5 sm:p-6">
                        <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
                          <span>{course.moduleCount ?? 0} Modules</span>
                          <span aria-hidden="true">·</span>
                          <span>{course.lessonCount ?? 0} Lessons</span>
                          <span aria-hidden="true">·</span>
                          {course.price > 0 ? (
                            pricing.applies ? (
                              <span className="inline-flex items-center gap-1.5 font-mono">
                                <span className="line-through opacity-60">
                                  {course.currency} {formatMoneyAmount(pricing.originalPrice)}
                                </span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                  {pricing.finalPrice <= 0
                                    ? 'Free'
                                    : `${course.currency} ${formatMoneyAmount(pricing.finalPrice)}`}
                                </span>
                                <span className="text-[11px] font-semibold text-[#176BFF] dark:text-[#00D4FF]">
                                  (-{pricing.discountPercent}%)
                                </span>
                              </span>
                            ) : (
                              <span className="font-mono font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                                {course.currency} {course.price}
                              </span>
                            )
                          ) : (
                            <span className="font-mono font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                              Free
                            </span>
                          )}
                        </div>
                        <h2 className="mt-2 text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                          {course.title}
                        </h2>
                        {course.ratingsEnabled !== false && (
                          <div className="mt-2">
                            <StarRatingDisplay
                              rating={course.averageRating}
                              count={course.reviewCount}
                              size="xs"
                            />
                          </div>
                        )}
                        <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                          {course.shortDescription}
                        </p>
                      </div>
                    </div>
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                      <AppLink
                        to={`/learn/${course.slug}`}
                        className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] py-2.5 text-sm font-semibold text-white transition-colors"
                      >
                        View Curriculum &amp; Enrol
                        <ArrowRight className="w-4 h-4" />
                      </AppLink>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <LeadForm
            interestType="course"
            interestSlug="training-programmes"
            interestName="Training Programmes & Workshops"
            heading="Enquire About Training Programmes"
            subheading="Interested in upcoming cohorts or custom corporate workshops for your team?"
          />
        </div>
      </section>
    </>
  );
}
