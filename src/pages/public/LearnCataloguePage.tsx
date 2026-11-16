import { useEffect, useState } from 'react';
import { ArrowRight, BookOpen } from 'lucide-react';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { StarRatingDisplay } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import type { CourseItem } from '../../types';

export function LearnCataloguePage() {
  const { seoPages, navigate } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'learn');
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/public/courses')
      .then((r) => r.json())
      .then((d) => setCourses(d.courses || []))
      .finally(() => setLoading(false));
  }, []);

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

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
            NexaFlow Learn
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl">
            Structured Courses for Practitioners &amp; Teams
          </h1>
          <p className="mt-4 text-base text-[#AEB8D4] max-w-2xl leading-relaxed">
            Enrol in guided video courses with module progress tracking, learner support tickets, and verified online payments.
          </p>
        </div>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
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
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-12 text-center max-w-2xl mx-auto">
              <BookOpen className="w-8 h-8 mx-auto text-[#176BFF] dark:text-[#00D4FF] mb-3" />
              <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                No courses published yet
              </h2>
              <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                New training programmes are published directly from the NexaFlow Learn portal. If your organisation requires custom training, use the enquiry form below.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course) => (
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
                    <div className="p-6">
                      <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex items-center gap-2 tabular-nums">
                        <span>{course.moduleCount ?? 0} Modules</span>
                        <span aria-hidden="true">·</span>
                        <span>{course.lessonCount ?? 0} Lessons</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                          {course.price > 0 ? `${course.currency} ${course.price}` : 'Free'}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                        {course.title}
                      </h2>
                      <div className="mt-2">
                        <StarRatingDisplay
                          rating={course.averageRating}
                          count={course.reviewCount}
                          size="xs"
                        />
                      </div>
                      <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                        {course.shortDescription}
                      </p>
                    </div>
                  </div>
                  <div className="px-6 pb-6">
                    <button
                      type="button"
                      onClick={() => navigate(`/learn/${course.slug}`)}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] py-2.5 text-sm font-semibold text-white transition-colors"
                    >
                      View Curriculum &amp; Enrol
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="py-16">
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
