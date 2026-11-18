import { ArrowRight, Cpu } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { MediaImage } from '../../components/MediaImage';
import { HeroEntrance, StaggerGrid, StaggerItem } from '../../components/MotionPrimitives';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';

export function ProductsPage() {
  const { products, seoPages } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'products');

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

      <section className="bg-[#03051B] nf-hero-ambient text-[#F7F8FF] border-b border-[#1A2550] py-12 sm:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <HeroEntrance delay={0}>
            <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
              Product Catalogue
            </p>
          </HeroEntrance>
          <HeroEntrance delay={0.06}>
            <h1 className="mt-3 text-[clamp(1.75rem,4.2vw,3rem)] font-bold tracking-tight leading-[1.12]">
              NexaFlow Products
            </h1>
          </HeroEntrance>
          <HeroEntrance delay={0.12}>
            <p className="mt-4 text-base text-[#AEB8D4] max-w-2xl leading-relaxed">
              Dedicated software products engineered by NexaFlow Technologies. All product details and availability are kept directly up to date from our product registry.
            </p>
          </HeroEntrance>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {products.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-12 text-center">
              <Cpu className="w-8 h-8 mx-auto text-[#176BFF] dark:text-[#00D4FF] mb-3" />
              <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                No products published yet
              </h2>
              <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                Published software products will appear here once configured.
              </p>
            </div>
          ) : (
            <StaggerGrid className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {products.map((product) => (
                <StaggerItem key={product.slug} className="flex">
                  <article
                    className="group w-full rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden flex flex-col justify-between nf-card-interactive hover:border-[#176BFF]/60"
                  >
                    <div>
                      <div className="aspect-video bg-[#03051B] overflow-hidden">
                        <MediaImage
                          src={product.images?.[0] || '/assets/images/product_gridmind_ai.jpg'}
                          alt={product.name}
                          width={640}
                          height={360}
                          sizes="(max-width: 767px) 100vw, 48vw"
                          className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                        />
                      </div>
                      <div className="p-5 sm:p-8">
                        <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>{product.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>{product.pricingStatus}</span>
                        </div>
                        <h2 className="mt-2 text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                          {product.name}
                        </h2>
                        <p className="mt-3 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
                          {product.shortDescription}
                        </p>
                      </div>
                    </div>
                    <div className="px-5 sm:px-8 pb-6 sm:pb-8">
                      <AppLink
                        to={`/products/${product.slug}`}
                        className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                      >
                        Explore {product.name}
                        <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </AppLink>
                    </div>
                  </article>
                </StaggerItem>
              ))}
            </StaggerGrid>
          )}
        </div>
      </section>
    </>
  );
}
