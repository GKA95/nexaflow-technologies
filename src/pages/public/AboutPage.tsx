import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { HeroEntrance, Reveal, StaggerGrid, StaggerItem } from '../../components/MotionPrimitives';
import { RichContentRenderer } from '../../components/RichContentRenderer';
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

      <section className="bg-[#03051B] nf-hero-ambient text-[#F7F8FF] border-b border-[#1A2550] py-12 sm:py-16 lg:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <HeroEntrance delay={0}>
            <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
              About NexaFlow Technologies
            </p>
          </HeroEntrance>
          <HeroEntrance delay={0.06}>
            <h1 className="mt-3 text-[clamp(1.75rem,4.2vw,3rem)] font-bold tracking-tight leading-[1.12]">
              {settings?.tagline || 'Innovate • Automate • Transform'}
            </h1>
          </HeroEntrance>
          <HeroEntrance delay={0.12}>
            <div className="mt-5 max-w-3xl">
              <RichContentRenderer
                surface="dark"
                content={
                  settings?.aboutIntro ||
                  'NexaFlow Technologies is a technology business focused on AI, data engineering, digital platforms, and practical technical education.'
                }
              />
            </div>
          </HeroEntrance>
        </div>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <StaggerGrid className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
          <StaggerItem className="flex">
            <div className="w-full rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 nf-card-interactive">
              <h2 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">Mission</h2>
              <div className="mt-3">
                <RichContentRenderer compact content={settings?.mission} />
              </div>
            </div>
          </StaggerItem>
          <StaggerItem className="flex">
            <div className="w-full rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 nf-card-interactive">
              <h2 className="text-xl font-semibold text-[#070B24] dark:text-[#F7F8FF]">Vision</h2>
              <div className="mt-3">
                <RichContentRenderer compact content={settings?.vision} />
              </div>
            </div>
          </StaggerItem>
        </StaggerGrid>
      </section>

      <section className="py-16 border-b border-[#DCE3F2] dark:border-[#1A2550]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
              Principles &amp; Values
            </h2>
          </Reveal>
          <StaggerGrid className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(settings?.values || []).map((val) => (
              <StaggerItem key={val} className="flex">
                <div className="w-full rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 flex items-start gap-3 nf-card-interactive">
                  <CheckCircle2 className="w-5 h-5 text-[#00D4FF] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#070B24] dark:text-[#F7F8FF] leading-relaxed">{val}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
              Areas of Expertise
            </h2>
          </Reveal>
          <StaggerGrid className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {services.map((s) => (
              <StaggerItem key={s.slug} className="flex">
                <div className="group w-full rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 nf-card-interactive hover:border-[#176BFF]/60">
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
                    <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </AppLink>
                </div>
              </StaggerItem>
            ))}
          </StaggerGrid>
        </div>
      </section>
    </>
  );
}
