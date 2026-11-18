import { HeroEntrance } from '../../components/MotionPrimitives';
import { RichContentRenderer } from '../../components/RichContentRenderer';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';

type LegalType = 'privacy' | 'terms' | 'cookies' | 'refund';

export function LegalPage({ type }: { type: LegalType }) {
  const { settings } = useApp();

  const meta: Record<LegalType, { title: string; content: string }> = {
    privacy: {
      title: 'Privacy Policy',
      content: settings?.legalPrivacy || '',
    },
    terms: {
      title: 'Terms of Service',
      content: settings?.legalTerms || '',
    },
    cookies: {
      title: 'Cookie & Analytics Notice',
      content: settings?.legalCookies || '',
    },
    refund: {
      title: 'Course & Refund Policy',
      content: settings?.legalRefund || '',
    },
  };

  const current = meta[type];

  return (
    <>
      <SEOHead
        title={`${current.title} | NexaFlow Technologies`}
        description={`${current.title} for NexaFlow Technologies.`}
      />

      <section className="py-12 sm:py-16 lg:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <HeroEntrance delay={0}>
            <p className="text-xs font-medium uppercase tracking-wider text-[#176BFF] dark:text-[#00D4FF]">
              Legal &amp; Governance
            </p>
            <h1 className="mt-2 text-[clamp(1.75rem,3.6vw,2.5rem)] font-bold leading-[1.15] text-[#070B24] dark:text-[#F7F8FF]">
              {current.title}
            </h1>
          </HeroEntrance>

          <HeroEntrance delay={0.08}>
            <div className="mt-6 sm:mt-8 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-8">
              <RichContentRenderer
                content={current.content}
                emptyFallback="Policy content can be configured in the Administrator Portal."
              />
            </div>
          </HeroEntrance>
        </div>
      </section>
    </>
  );
}
