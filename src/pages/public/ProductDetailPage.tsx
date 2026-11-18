import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ExternalLink } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { LeadForm } from '../../components/LeadForm';
import { MediaImage } from '../../components/MediaImage';
import { HeroEntrance, Reveal } from '../../components/MotionPrimitives';
import { RichContentRenderer } from '../../components/RichContentRenderer';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { ProductItem } from '../../types';
import { trackEvent } from '../../utils/analytics';
import { normalizeImageUrl } from '../../utils/media';

export function ProductDetailPage({ slug }: { slug: string }) {
  const { products, consent } = useApp();
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
        <AppLink
          to="/products"
          className="mt-4 inline-flex items-center text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Products
        </AppLink>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const productUrl = `${origin}/products/${product.slug}`;
  const rawImg = normalizeImageUrl(product.ogImage || product.images?.[0]);
  const productImage = rawImg
    ? /^https?:\/\//i.test(rawImg)
      ? rawImg
      : `${origin}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`
    : `${origin}/og-image.png`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: product.name,
      applicationCategory: product.category || 'BusinessApplication',
      operatingSystem: 'Web',
      description: product.seoDescription || product.shortDescription,
      image: productImage,
      url: productUrl,
      brand: {
        '@type': 'Organization',
        name: 'NexaFlow Technologies',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Products', item: `${origin}/products` },
        { '@type': 'ListItem', position: 3, name: product.name, item: productUrl },
      ],
    },
  ];

  return (
    <>
      <SEOHead
        title={product.seoTitle || `${product.name} | NexaFlow Technologies`}
        description={product.seoDescription || product.shortDescription}
        canonicalUrl={product.canonicalUrl}
        ogImage={product.ogImage || product.images?.[0]}
        keywords={product.focusKeyword}
        noIndex={product.noIndex}
        structuredData={structuredData}
      />

      <section className="bg-[#03051B] nf-hero-ambient text-[#F7F8FF] border-b border-[#1A2550] py-12 sm:py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <AppLink
            to="/products"
            className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-medium text-[#AEB8D4] hover:text-[#00D4FF] mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Products
          </AppLink>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <HeroEntrance delay={0.04} className="lg:col-span-7 flex flex-col justify-center">
              <div className="text-xs text-[#00D4FF] flex flex-wrap items-center gap-2 mb-2">
                <span>{product.category}</span>
                <span aria-hidden="true">·</span>
                <span>{product.pricingStatus}</span>
              </div>
              <h1 className="text-[clamp(1.75rem,4.2vw,3rem)] font-bold tracking-tight leading-[1.12]">
                {product.name}
              </h1>
              <p className="mt-4 text-base sm:text-lg text-[#AEB8D4] leading-relaxed">
                {product.shortDescription}
              </p>
              <div className="mt-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                <a
                  href="#product-enquiry"
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-3 text-sm font-semibold text-white transition-colors"
                >
                  Enquire About {product.name}
                </a>
                {product.demoLink && (
                  <a
                    href={product.demoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg border border-[#1A2550] px-4 py-3 text-sm font-medium text-[#F7F8FF] hover:border-[#00D4FF]"
                  >
                    Open Demo
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
            </HeroEntrance>
            <HeroEntrance delay={0.12} className="lg:col-span-5">
              <div className="h-full min-h-[220px] sm:min-h-[260px] rounded-xl overflow-hidden border border-[#1A2550] bg-[#080D2B]">
                <MediaImage
                  src={product.images?.[0] || '/assets/images/product_gridmind_ai.jpg'}
                  alt={product.name}
                  loading="eager"
                  fetchPriority="high"
                  width={1200}
                  height={675}
                  sizes="(max-width: 1023px) 100vw, 42vw"
                  className="w-full h-full object-cover"
                />
              </div>
            </HeroEntrance>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-7 space-y-8">
            <Reveal>
              <h2 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                Product Overview
              </h2>
              <div className="mt-3">
                <RichContentRenderer content={product.fullDescription || product.shortDescription} />
              </div>
            </Reveal>

            {product.features?.length > 0 && (
              <Reveal delay={0.05}>
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
              </Reveal>
            )}

            {product.benefits?.length > 0 && (
              <Reveal delay={0.08}>
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
              </Reveal>
            )}
          </div>

          <Reveal delay={0.1} className="lg:col-span-5">
            <div id="product-enquiry" className="scroll-mt-20">
              <LeadForm
                interestType="product"
                interestSlug={product.slug}
                interestName={product.name}
                heading={`Enquire About ${product.name}`}
                subheading="Request updates, pricing information, or a product briefing."
              />
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
