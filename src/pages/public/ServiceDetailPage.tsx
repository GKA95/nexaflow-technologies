import { useEffect, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { ServiceItem } from '../../types';

export function ServiceDetailPage({ slug }: { slug: string }) {
  const { services, navigate } = useApp();
  const cached = services.find((s) => s.slug === slug) || null;
  const [service, setService] = useState<ServiceItem | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/services/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.service) setService(data.service);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading service details...
      </div>
    );
  }

  if (!service) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Service Not Found</h1>
        <button
          type="button"
          onClick={() => navigate('/solutions')}
          className="mt-4 text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Solutions
        </button>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: service.name,
      description: service.shortDescription,
      provider: {
        '@type': 'Organization',
        name: 'NexaFlow Technologies',
        url: origin,
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Solutions', item: `${origin}/solutions` },
        {
          '@type': 'ListItem',
          position: 3,
          name: service.name,
          item: `${origin}/solutions/${service.slug}`,
        },
      ],
    },
  ];

  return (
    <>
      <SEOHead
        title={service.seoTitle || `${service.name} | NexaFlow Technologies`}
        description={service.seoDescription || service.shortDescription}
        canonicalUrl={service.canonicalUrl}
        ogImage={service.ogImage || service.coverImage}
        keywords={service.focusKeyword}
        noIndex={service.noIndex}
        structuredData={structuredData}
      />

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/solutions')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AEB8D4] hover:text-[#00D4FF] mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Solutions
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">{service.name}</h1>
              <p className="mt-4 text-base sm:text-lg text-[#AEB8D4] leading-relaxed">
                {service.shortDescription}
              </p>
              <div className="mt-6">
                <a
                  href="#service-enquiry"
                  className="inline-flex items-center rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-3 text-sm font-semibold text-white transition-colors"
                >
                  {service.ctaLabel || `Enquire About ${service.name}`}
                </a>
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="h-full min-h-[240px] rounded-xl overflow-hidden border border-[#1A2550]">
                <MediaImage
                  src={service.coverImage}
                  alt={service.name}
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
            <div>
              <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">Overview</h2>
              <p className="mt-3 text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed whitespace-pre-line">
                {service.overview}
              </p>
            </div>

            {service.problemsAddressed?.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Problems Addressed
                </h2>
                <ul className="mt-4 space-y-3">
                  {service.problemsAddressed.map((p) => (
                    <li key={p} className="flex items-start gap-3 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                      <Check className="w-4 h-4 text-[#00D4FF] shrink-0 mt-1" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {service.deliverables?.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  What We Deliver
                </h2>
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {service.deliverables.map((d) => (
                    <div
                      key={d}
                      className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-4 text-sm text-[#070B24] dark:text-[#F7F8FF]"
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div id="service-enquiry" className="lg:col-span-5">
            <LeadForm
              interestType="service"
              interestSlug={service.slug}
              interestName={service.name}
              showBudget
              heading={`Enquire About ${service.name}`}
              subheading="Share your requirements and preferred contact method."
              submitLabel={service.ctaLabel || 'Submit Service Enquiry'}
            />
          </div>
        </div>
      </section>
    </>
  );
}
