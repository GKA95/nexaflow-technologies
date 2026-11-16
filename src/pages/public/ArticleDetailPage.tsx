import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { ArticleItem } from '../../types';

export function ArticleDetailPage({ slug }: { slug: string }) {
  const { navigate } = useApp();
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
        <button
          type="button"
          onClick={() => navigate('/insights')}
          className="mt-4 text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
        >
          Back to Insights
        </button>
      </div>
    );
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.seoDescription || article.excerpt,
    author: {
      '@type': 'Person',
      name: article.authorName || 'NexaFlow Editorial',
    },
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    publisher: {
      '@type': 'Organization',
      name: 'NexaFlow Technologies',
    },
  };

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
          <button
            type="button"
            onClick={() => navigate('/insights')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#176BFF] dark:hover:text-[#00D4FF] mb-6"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Insights
          </button>

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

          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-[#070B24] dark:text-[#F7F8FF]">
            {article.title}
          </h1>

          {article.excerpt && (
            <p className="mt-4 text-lg text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              {article.excerpt}
            </p>
          )}

          {article.featuredImage && (
            <div className="mt-8 rounded-xl overflow-hidden border border-[#DCE3F2] dark:border-[#1A2550] aspect-video">
              <MediaImage
                src={article.featuredImage}
                alt={article.title}
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
                  <button
                    type="button"
                    onClick={() => navigate(article.ctaHref!)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-5 py-2.5 text-sm font-semibold text-white"
                  >
                    {article.ctaLabel}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
              {article.internalLinks && article.internalLinks.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-[#4A5578] dark:text-[#AEB8D4]">
                    Related Solutions &amp; Courses
                  </p>
                  <div className="flex flex-wrap gap-4">
                    {article.internalLinks.map((lnk) => (
                      <button
                        key={lnk.href}
                        type="button"
                        onClick={() => navigate(lnk.href)}
                        className="text-sm font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                      >
                        {lnk.label}
                      </button>
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
                  <button
                    key={rel.slug}
                    type="button"
                    onClick={() => navigate(`/insights/${rel.slug}`)}
                    className="text-left rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 hover:border-[#176BFF] transition-colors"
                  >
                    <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                      {rel.category} · {rel.readingTimeMinutes} min read
                    </p>
                    <p className="mt-1.5 font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                      {rel.title}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </>
  );
}
