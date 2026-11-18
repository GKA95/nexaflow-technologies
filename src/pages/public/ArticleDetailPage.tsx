import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { AppLink } from '../../components/AppLink';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import type { ArticleItem } from '../../types';
import { normalizeImageUrl } from '../../utils/media';

export function ArticleDetailPage({ slug }: { slug: string }) {
  const [article, setArticle] = useState<ArticleItem | null>(null);
  const [related, setRelated] = useState<ArticleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/public/articles/${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.article) {
          setArticle(d.article);
          setRelated(d.related || []);
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading article...
      </div>
    );
  }

  if (!article) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Article Not Found</h1>
        <AppLink
          to="/insights"
          className="mt-4 inline-flex items-center text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Insights
        </AppLink>
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const articleUrl = `${origin}/insights/${article.slug}`;
  const rawImg = normalizeImageUrl(article.ogImage || article.featuredImage);
  const articleImage = rawImg
    ? /^https?:\/\//i.test(rawImg)
      ? rawImg
      : `${origin}${rawImg.startsWith('/') ? '' : '/'}${rawImg}`
    : `${origin}/og-image.png`;

  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.seoDescription || article.excerpt,
      image: articleImage,
      url: articleUrl,
      author: {
        '@type': 'Person',
        name: article.authorName || 'NexaFlow Editorial',
      },
      ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
      ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
      publisher: {
        '@type': 'Organization',
        name: 'NexaFlow Technologies',
        logo: {
          '@type': 'ImageObject',
          url: `${origin}/favicon.svg`,
        },
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: 'Insights', item: `${origin}/insights` },
        { '@type': 'ListItem', position: 3, name: article.title, item: articleUrl },
      ],
    },
  ];

  return (
    <>
      <SEOHead
        title={article.seoTitle || `${article.title} | NexaFlow Insights`}
        description={article.seoDescription || article.excerpt}
        canonicalUrl={article.canonicalUrl}
        ogImage={article.ogImage || article.featuredImage}
        ogType="article"
        keywords={[article.focusKeyword || '', ...(article.tags || [])]}
        noIndex={article.noIndex}
        structuredData={structuredData}
      />

      <article className="py-12 lg:py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <AppLink
            to="/insights"
            className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#176BFF] dark:hover:text-[#00D4FF] mb-4"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Insights
          </AppLink>

          <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex flex-wrap items-center gap-2">
            <span>{article.category}</span>
            <span aria-hidden="true">·</span>
            <span>{article.readingTimeMinutes} min read</span>
            {article.authorName && (
              <>
                <span aria-hidden="true">·</span>
                <span>By {article.authorName}</span>
              </>
            )}
            {article.publishedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>

          <h1 className="mt-3 text-[clamp(1.75rem,3.8vw,2.5rem)] font-bold tracking-tight leading-[1.15] text-[#070B24] dark:text-[#F7F8FF]">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="mt-4 text-base sm:text-lg text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              {article.excerpt}
            </p>
          )}

          {article.featuredImage && (
            <div className="mt-8 rounded-xl overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] aspect-video bg-[#03051B]">
              <MediaImage
                src={article.featuredImage}
                alt={article.title}
                loading="eager"
                fetchPriority="high"
                width={1200}
                height={675}
                sizes="(max-width: 767px) 100vw, 768px"
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="mt-8 space-y-5 text-base text-[#070B24] dark:text-[#F7F8FF]/90 leading-relaxed whitespace-pre-line">
            {article.content}
          </div>

          {article.tags?.length > 0 && (
            <div className="mt-8 pt-6 border-t border-[#DCE3F2] dark:border-[#1A2550] text-xs text-[#4A5578] dark:text-[#AEB8D4]">
              Topics: {article.tags.join(' · ')}
            </div>
          )}

          {(article.ctaLabel || (article.internalLinks && article.internalLinks.length > 0)) && (
            <div className="mt-10 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4">
              {article.ctaLabel && article.ctaHref && (
                <div>
                  <AppLink
                    to={article.ctaHref}
                    className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    {article.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </AppLink>
                </div>
              )}
              {article.internalLinks && article.internalLinks.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#4A5578] dark:text-[#AEB8D4]">
                    Related Solutions &amp; Courses
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {article.internalLinks.map((lnk) => (
                      <AppLink
                        key={lnk.href}
                        to={lnk.href}
                        className="min-h-[40px] inline-flex items-center text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                      >
                        {lnk.label}
                      </AppLink>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {related.length > 0 && (
            <div className="mt-12 pt-10 border-t border-[#DCE3F2] dark:border-[#1A2550]">
              <h2 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF] mb-5">
                Related Articles
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {related.map((rel) => (
                  <AppLink
                    key={rel.slug}
                    to={`/insights/${rel.slug}`}
                    className="block text-left rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 hover:border-[#176BFF] transition-colors"
                  >
                    <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                      {rel.category} · {rel.readingTimeMinutes} min read
                    </p>
                    <p className="mt-1.5 font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                      {rel.title}
                    </p>
                  </AppLink>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </>
  );
}
