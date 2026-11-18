import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';

export function AboutPage() {
  const { settings, services, seoPages } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'about');

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

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
            About NexaFlow Technologies
          </p>
          <h1 className="mt-3 text-[clamp(1.75rem,4.2vw,3rem)] font-bold tracking-tight leading-[1.12]">
            {settings?.tagline || 'Innovate • Automate • Transform'}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-[#AEB8D4] leading-relaxed max-w-3xl">
            {settings?.aboutIntro ||
              'NexaFlow Technologies is a technology business focused on AI, data engineering, digital platforms, and practical technical education.'}
          </p>
        </div>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8">
            <h2 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">Mission</h2>
            <p className="mt-3 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              {settings?.mission}
            </p>
          </div>
          <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8">
            <h2 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">Vision</h2>
            <p className="mt-3 text-sm sm:text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              {settings?.vision}
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
            Principles &amp; Values
          </h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(settings?.values || []).map((val) => (
              <div
                key={val}
                className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 text-[#00D4FF] shrink-0 mt-0.5" />
                <p className="text-sm text-[#070B24] dark:text-[#F7F8FF] leading-relaxed">{val}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
            Areas of Expertise
          </h2>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {services.map((s) => (
              <div
                key={s.slug}
                className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6"
              >
                <h3 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                  {s.name}
                </h3>
                <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  {s.shortDescription}
                </p>
                <AppLink
                  to={`/solutions/${s.slug}`}
                  className="mt-3 min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                >
                  Explore service
                  <ArrowRight className="w-4 h-4" />
                </AppLink>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
