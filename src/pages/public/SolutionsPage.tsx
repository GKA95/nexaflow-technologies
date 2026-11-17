import { ArrowRight } from 'lucide-react';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';

export function SolutionsPage() {
  const { services, seoPages, navigate } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'solutions');

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
            Solutions &amp; Services
          </p>
          <h1 className="mt-3 text-[clamp(1.75rem,4.2vw,3rem)] font-bold tracking-tight leading-[1.12] max-w-3xl">
            Engineering &amp; Analytics Capabilities Built for Real Operations
          </h1>
          <p className="mt-4 text-base text-[#AEB8D4] max-w-2xl leading-relaxed">
            Explore our core service lines. Each solution page details the problems addressed, deliverables, and a dedicated scoping enquiry flow.
          </p>
        </div>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {services.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-center">
              <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                No published services yet.
              </p>
            </div>
          ) : (
            services.map((service, idx) => (
              <article
                key={service.slug}
                className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
              >
                <div className="lg:col-span-4 aspect-video lg:aspect-auto lg:min-h-[220px] bg-[#03051B]">
                  <MediaImage
                    src={service.coverImage}
                    alt={service.name}
                    width={640}
                    height={360}
                    sizes="(max-width: 1023px) 100vw, 33vw"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="lg:col-span-8 p-5 sm:p-8 flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                      0{idx + 1}. Solution Area
                    </p>
                    <h2 className="mt-2 text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                      {service.name}
                    </h2>
                    <p className="mt-3 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                      {service.shortDescription}
                    </p>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-4">
                    <button
                      type="button"
                      onClick={() => navigate(`/solutions/${service.slug}`)}
                      className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                    >
                      View {service.name} Details
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <LeadForm
            interestType="consultation"
            interestSlug="solutions-overview"
            interestName="Solutions Consultation"
            showBudget
            heading="Not Sure Which Service Fits Best?"
            subheading="Describe your operational goal and we will recommend an appropriate starting scope."
          />
        </div>
      </section>
    </>
  );
}
