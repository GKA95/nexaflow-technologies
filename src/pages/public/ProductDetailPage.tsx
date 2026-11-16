import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { ProductItem } from '../../types';
import { trackEvent } from '../../utils/analytics';

export function ProductDetailPage({ slug }: { slug: string }) {
  const { products, navigate, consent } = useApp();
  const cached = products.find((p) => p.slug === slug) || null;
  const [product, setProduct] = useState<ProductItem | null>(cached);
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    fetch(`/api/public/products/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.product) setProduct(data.product);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (product) {
      trackEvent('product_view', {
        entitySlug: product.slug,
        consentAccepted: consent === 'accepted',
      });
    }
  }, [product, consent]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading product...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Product Not Found</h1>
        <button
          type="button"
          onClick={() => navigate('/products')}
          className="mt-4 text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Products
        </button>
      </div>
    );
  }

  return (
    <>
      <SEOHead
        title={product.seoTitle || `${product.name} | NexaFlow Technologies`}
        description={product.seoDescription || product.shortDescription}
        canonicalUrl={product.canonicalUrl}
        ogImage={product.ogImage || product.images?.[0]}
        keywords={product.focusKeyword}
        noIndex={product.noIndex}
        structuredData={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: product.name,
          applicationCategory: product.category || 'BusinessApplication',
          operatingSystem: 'Web',
          description: product.seoDescription || product.shortDescription,
          url: `${window.location.origin}/products/${product.slug}`,
        }}
      />

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-14 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => navigate('/products')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#AEB8D4] hover:text-[#00D4FF] mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Products
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div className="text-xs text-[#00D4FF] flex items-center gap-2 mb-2">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>{product.pricingStatus}</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">{product.name}</h1>
              <p className="mt-4 text-base sm:text-lg text-[#AEB8D4] leading-relaxed">
                {product.shortDescription}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="#product-enquiry"
                  className="inline-flex items-center rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-3 text-sm font-semibold text-white transition-colors"
                >
                  Enquire About {product.name}
                </a>
                {product.demoLink && (
                  <a
                    href={product.demoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-[#1A2550] px-4 py-3 text-sm font-medium text-[#F7F8FF] hover:border-[#00D4FF]"
                  >
                    Open Demo
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </div>
            <div className="lg:col-span-5">
              <div className="h-full min-h-[240px] rounded-xl overflow-hidden border border-[#1A2550]">
                <MediaImage
                  src={product.images?.[0] || '/assets/images/product_gridmind_ai.jpg'}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                Product Overview
              </h2>
              <p className="mt-3 text-base text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed whitespace-pre-line">
                {product.fullDescription || product.shortDescription}
              </p>
            </div>

            {product.features?.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Features
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {product.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                      <Check className="w-4 h-4 text-[#00D4FF] shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.benefits?.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                  Operational Benefits
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {product.benefits.map((b) => (
                    <li key={b} className="flex items-start gap-3 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                      <Check className="w-4 h-4 text-[#176BFF] shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div id="product-enquiry" className="lg:col-span-5">
            <LeadForm
              interestType="product"
              interestSlug={product.slug}
              interestName={product.name}
              heading={`Enquire About ${product.name}`}
              subheading="Request updates, pricing information, or a product briefing."
            />
          </div>
        </div>
      </section>
    </>
  );
}
