import { ArrowRight, BookOpen, Briefcase, Check, Compass, Cpu, ExternalLink, FileText, Quote } from 'lucide-react';
import { CouponApplyBar } from '../../components/CouponApplyBar';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { StarRatingDisplay } from '../../components/StarRating';
import { useApp } from '../../context/AppContext';
import { formatMoneyAmount, getCourseDiscountPricing } from '../../utils/pricing';

export function HomePage() {
  const {
    navigate,
    settings,
    services,
    products,
    featuredCourses,
    featuredArticles,
    workItems,
    testimonials,
    seoPages,
    appliedCoupon,
  } = useApp();

  const homeSeo = seoPages.find((p) => p.pageKey === 'home');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: settings?.businessName || 'NexaFlow Technologies',
      description: settings?.descriptor || 'AI, Data & Digital Solutions',
      url: origin,
      logo: `${origin}/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png`,
      ...(settings?.email ? { email: settings.email } : {}),
      ...(settings?.phone ? { telephone: settings.phone } : {}),
      ...(settings?.generalLocation ? { areaServed: settings.generalLocation } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: settings?.businessName || 'NexaFlow Technologies',
      url: origin,
    },
  ];

  const workflowSteps = [
    {
      step: '01. Operational Discovery',
      text: 'We map your existing systems, data quality, and manual bottlenecks before recommending technology.',
    },
    {
      step: '02. Structured Architecture',
      text: 'Every web platform, analytics pipeline, or automation workflow is designed with clear security boundaries and maintainable code.',
    },
    {
      step: '03. Engineering & Verification',
      text: 'We build against real data, test edge cases server-side, and integrate payments, CRM, and reporting cleanly.',
    },
    {
      step: '04. Handover & Training',
      text: 'Your team receives clear documentation, admin controls, and practical training so you never depend on opaque lock-in.',
    },
  ];

  const reasons = [
    'Architecture tailored to real business processes rather than generic templates.',
    'Strict separation between public experiences, private customer data, and admin governance.',
    'Honest technical scoping—we advise against unnecessary complexity when simpler tooling works better.',
    'Integrated delivery spanning software engineering, data intelligence, and structured team learning.',
  ];

  return (
    <>
      <SEOHead
        title={homeSeo?.title}
        description={homeSeo?.description}
        canonicalUrl={homeSeo?.canonicalUrl}
        ogTitle={homeSeo?.ogTitle}
        ogDescription={homeSeo?.ogDescription}
        ogImage={homeSeo?.ogImage}
        keywords={homeSeo?.focusKeyword}
        noIndex={homeSeo?.noIndex}
        structuredData={structuredData}
      />

      {/* 1. Hero Proposition Section */}
      <section className="relative bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <p className="text-xs font-medium tracking-wider uppercase text-[#00D4FF] mb-3">
                {settings?.descriptor || 'AI, Data & Digital Solutions'}
              </p>
              <h1 className="text-[clamp(1.85rem,4.4vw,3.15rem)] font-bold tracking-tight text-[#F7F8FF] leading-[1.12] max-w-2xl">
                {settings?.heroHeadline ||
                  'Intelligent systems, reliable data, and practical digital engineering.'}
              </h1>
              <p className="mt-4 sm:mt-5 text-base sm:text-lg text-[#AEB8D4] leading-relaxed max-w-2xl">
                {settings?.heroSubheadline ||
                  'NexaFlow Technologies partners with organisations to build AI automation, custom web platforms, data analytics, applied machine learning, and structured technical training.'}
              </p>

              {/* Primary CTA + clean balanced exploration buttons */}
              <div className="mt-7 sm:mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/contact?type=consultation')}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-3 text-sm font-semibold text-white transition-colors whitespace-nowrap"
                >
                  Request a Consultation
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/solutions')}
                  className="flex-1 sm:flex-none min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-[#1A2550] bg-[#080D2B] hover:border-[#00D4FF]/60 px-4 py-3 text-sm font-medium text-[#F7F8FF] transition-colors whitespace-nowrap"
                >
                  Explore Solutions
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="flex-1 sm:flex-none min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-[#1A2550] bg-[#080D2B] hover:border-[#00D4FF]/60 px-4 py-3 text-sm font-medium text-[#F7F8FF] transition-colors whitespace-nowrap"
                >
                  Explore Products
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/learn')}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-[#1A2550] bg-[#080D2B] hover:border-[#00D4FF]/60 px-4 py-3 text-sm font-medium text-[#F7F8FF] transition-colors whitespace-nowrap"
                >
                  Explore Courses
                </button>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[220px] sm:min-h-[280px] rounded-xl overflow-hidden border border-[#1A2550] bg-[#080D2B]">
                <MediaImage
                  src="/assets/images/hero_nexaflow_architecture.jpg"
                  alt="NexaFlow Technologies layered AI and data systems architecture"
                  loading="eager"
                  fetchPriority="high"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Featured Solutions / Services */}
      <section className="py-16 lg:py-24 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                Core Solutions &amp; Engineering Services
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] max-w-2xl">
                Focused capabilities built around operational reliability, clean data, and measurable execution.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/solutions')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline whitespace-nowrap shrink-0"
            >
              View all solutions
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {services.map((service, idx) => (
              <article
                key={service.slug}
                className="group rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 sm:p-8 flex flex-col justify-between hover:border-[#176BFF]/60 transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-4 text-xs text-[#4A5578] dark:text-[#AEB8D4] font-mono tabular-nums mb-3">
                    <span>0{idx + 1}. Service Capability</span>
                    <Compass className="w-4 h-4 text-[#176BFF] dark:text-[#00D4FF]" />
                  </div>
                  <h3 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                    {service.name}
                  </h3>
                  <p className="mt-2.5 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                    {service.shortDescription}
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-[#DCE3F2] dark:border-[#1A2550] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => navigate(`/solutions/${service.slug}`)}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                  >
                    Explore {service.name}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Featured Products */}
      <section className="py-16 lg:py-20 bg-[#EEF2FA]/60 dark:bg-[#080D2B]/40 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                Products
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] max-w-2xl">
                Software products engineered and maintained by NexaFlow Technologies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline whitespace-nowrap shrink-0"
            >
              Browse product catalogue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {products.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-center">
              <Cpu className="w-8 h-8 mx-auto text-[#176BFF] dark:text-[#00D4FF] mb-3" />
              <p className="text-sm font-medium text-[#070B24] dark:text-[#F7F8FF]">
                No products published yet.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {products.map((product) => (
                <article
                  key={product.slug}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden grid grid-cols-1 sm:grid-cols-5 items-stretch"
                >
                  <div className="sm:col-span-2 min-h-[180px] bg-[#03051B]">
                    <MediaImage
                      src={product.images?.[0] || '/assets/images/product_gridmind_ai.jpg'}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="sm:col-span-3 p-6 flex flex-col justify-between">
                    <div>
                      <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex items-center gap-2">
                        <span>{product.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{product.pricingStatus}</span>
                      </div>
                      <h3 className="mt-2 text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                        {product.name}
                      </h3>
                      <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                        {product.shortDescription}
                      </p>
                    </div>
                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={() => navigate(`/products/${product.slug}`)}
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                      >
                        View product details
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. Featured Courses (NexaFlow Learn) */}
      <section className="py-16 lg:py-20 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                NexaFlow Learn
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] max-w-2xl">
                Structured video courses, progress tracking, and direct instructor support for learners.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/learn')}
              className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline whitespace-nowrap shrink-0"
            >
              Explore course catalogue
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Front-page Coupon Code Input */}
          <div className="mb-8">
            <CouponApplyBar variant="surface" compact />
          </div>

          {featuredCourses.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 sm:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-[#176BFF]/10 text-[#176BFF] dark:text-[#00D4FF]">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                    No courses published yet
                  </h3>
                  <p className="mt-1 text-sm text-[#4A5578] dark:text-[#AEB8D4] max-w-xl">
                    Training programmes are managed in the NexaFlow Learn LMS and will appear here as soon as they are published. You can also enquire about tailored team training.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/contact?type=course')}
                className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2.5 text-sm font-medium text-[#070B24] dark:text-[#F7F8FF] hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] whitespace-nowrap shrink-0"
              >
                Enquire About Training
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredCourses.map((course) => {
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
                              <span className="font-mono font-medium text-[#070B24] dark:text-[#F7F8FF]">
                                {course.currency} {course.price}
                              </span>
                            )
                          ) : (
                            <span className="font-mono font-medium text-[#070B24] dark:text-[#F7F8FF]">
                              Free
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                          {course.title}
                        </h3>
                        <div className="mt-2">
                          <StarRatingDisplay
                            rating={course.averageRating}
                            count={course.reviewCount}
                            size="xs"
                          />
                        </div>
                        <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] line-clamp-3">
                          {course.shortDescription}
                        </p>
                      </div>
                    </div>
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                      <button
                        type="button"
                        onClick={() => navigate(`/learn/${course.slug}`)}
                        className="w-full min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] py-2.5 text-sm font-semibold text-white transition-colors"
                      >
                        View Course
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* 5. Work Done & Client Engagements */}
      <section className="py-16 lg:py-20 bg-[#EEF2FA]/60 dark:bg-[#080D2B]/40 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                Selected Work &amp; Client Delivery
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] max-w-2xl">
                Real systems, automation pipelines, and digital platforms delivered for client teams.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/contact?type=consultation')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline whitespace-nowrap shrink-0"
            >
              Discuss a similar project
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {workItems.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 flex items-center gap-4">
              <Briefcase className="w-6 h-6 text-[#176BFF] dark:text-[#00D4FF] shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                  Case studies &amp; project deliveries coming soon
                </p>
                <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  Published client engagements and engineering outcomes will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {workItems.map((work) => (
                <article
                  key={work._id}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {work.imageUrl && (
                      <div className="aspect-video bg-[#03051B]">
                        <MediaImage
                          src={work.imageUrl}
                          alt={work.title}
                          fallbackLabel={work.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-6">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#176BFF] dark:text-[#00D4FF] font-medium">
                        <span>{work.category}</span>
                        {(work.clientName || work.industry) && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-[#4A5578] dark:text-[#AEB8D4]">
                              {[work.clientName, work.industry].filter(Boolean).join(' — ')}
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-[#070B24] dark:text-[#F7F8FF]">
                        {work.title}
                      </h3>
                      <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                        {work.summary}
                      </p>

                      {work.outcomes?.length > 0 && (
                        <ul className="mt-4 space-y-1.5 text-xs text-[#070B24] dark:text-[#F7F8FF]">
                          {work.outcomes.slice(0, 3).map((outcome) => (
                            <li key={outcome} className="flex items-start gap-2">
                              <Check className="w-3.5 h-3.5 text-[#00D4FF] shrink-0 mt-0.5" />
                              <span>{outcome}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {(work.technologies?.length > 0 || work.projectUrl) && (
                    <div className="px-6 pb-6 pt-3 border-t border-[#DCE3F2] dark:border-[#1A2550] flex items-center justify-between gap-3">
                      <p className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4] truncate">
                        {work.technologies?.join(' · ')}
                      </p>
                      {work.projectUrl && (
                        <a
                          href={work.projectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline shrink-0"
                        >
                          View
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 6. Client Testimonials */}
      <section className="py-16 lg:py-20 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
              Client Testimonials
            </h2>
            <p className="mt-2 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] max-w-2xl">
              Feedback from organisations and teams who have worked with NexaFlow Technologies.
            </p>
          </div>

          {testimonials.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 flex items-center gap-4">
              <Quote className="w-6 h-6 text-[#176BFF] dark:text-[#00D4FF] shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                  Client testimonials will appear here
                </p>
                <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  Verified feedback from our project partners and training cohorts will be featured in this section.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {testimonials.map((t) => (
                <article
                  key={t._id}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <StarRatingDisplay
                        rating={t.rating}
                        showEmptyLabel={false}
                        size="xs"
                      />
                      <Quote className="w-4 h-4 text-[#176BFF]/40 dark:text-[#00D4FF]/40 shrink-0" />
                    </div>
                    <p className="mt-4 text-sm text-[#070B24] dark:text-[#F7F8FF] leading-relaxed">
                      &ldquo;{t.quote}&rdquo;
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-[#DCE3F2] dark:border-[#1A2550]">
                    <p className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                      {t.authorName}
                    </p>
                    {(t.authorRole || t.company) && (
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                        {[t.authorRole, t.company].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {t.workTitle && (
                      <p className="mt-1 text-[11px] font-mono text-[#176BFF] dark:text-[#00D4FF]">
                        {t.workTitle}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 7. How We Work & Why Partner With NexaFlow */}
      <section className="py-16 lg:py-20 bg-[#EEF2FA]/60 dark:bg-[#080D2B]/40 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                Why Organisations Work With NexaFlow
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                We focus on clear engineering standards, transparent scoping, and maintainable systems rather than buzzwords.
              </p>
              <ul className="mt-6 space-y-3.5">
                {reasons.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-[#070B24] dark:text-[#F7F8FF]">
                    <Check className="w-4 h-4 text-[#00D4FF] shrink-0 mt-1" />
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {workflowSteps.map((w) => (
                <div
                  key={w.step}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6"
                >
                  <h3 className="text-base font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                    {w.step}
                  </h3>
                  <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                    {w.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 6. Selected Insights / Articles */}
      <section className="py-16 lg:py-20 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                Insights &amp; Resources
              </h2>
              <p className="mt-2 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4]">
                Technical notes and practical guides from NexaFlow Technologies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/insights')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline whitespace-nowrap shrink-0"
            >
              Read all insights
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {featuredArticles.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 flex items-center gap-4">
              <FileText className="w-6 h-6 text-[#176BFF] dark:text-[#00D4FF] shrink-0" />
              <div>
                <p className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                  No articles published yet
                </p>
                <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  Published insights and technical guides will appear here once authored in the CMS.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {featuredArticles.map((art) => (
                <article
                  key={art.slug}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 flex flex-col justify-between"
                >
                  <div>
                    <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex items-center gap-2">
                      <span>{art.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{art.readingTimeMinutes} min read</span>
                    </div>
                    <h3 className="mt-2.5 text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                      {art.title}
                    </h3>
                    <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] line-clamp-3">
                      {art.excerpt}
                    </p>
                  </div>
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={() => navigate(`/insights/${art.slug}`)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                    >
                      Read article
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 7. Lead Generation Section */}
      <section className="py-16 lg:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
                Start a Technical Conversation
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                Whether you are scoping an automation pipeline, building a custom web platform, cleaning operational data, or exploring training, share your objectives below.
              </p>
              <div className="mt-6 space-y-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                {settings?.email && (
                  <p>
                    Email:{' '}
                    <a href={`mailto:${settings.email}`} className="text-[#176BFF] dark:text-[#00D4FF] hover:underline">
                      {settings.email}
                    </a>
                  </p>
                )}
                {settings?.phone && (
                  <p>
                    Telephone:{' '}
                    <a href={`tel:${settings.phone}`} className="text-[#176BFF] dark:text-[#00D4FF] hover:underline">
                      {settings.phone}
                    </a>
                  </p>
                )}
                {settings?.generalLocation && <p>Region: {settings.generalLocation}</p>}
              </div>
            </div>
            <div className="lg:col-span-7">
              <LeadForm
                interestType="consultation"
                interestSlug="homepage-consultation"
                interestName="General Consultation"
                showBudget
                heading="Request a Consultation"
                subheading="Tell us what you are looking to build or automate."
                submitLabel="Request Consultation"
              />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
