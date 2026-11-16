import { useEffect, useState } from 'react';
import { ArrowRight, FileText } from 'lucide-react';
import { MediaImage } from '../../components/MediaImage';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { ArticleItem } from '../../types';

export function InsightsPage() {
  const { seoPages, navigate } = useApp();
  const seo = seoPages.find((p) => p.pageKey === 'insights');
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = activeCategory !== 'All' ? `?category=${encodeURIComponent(activeCategory)}` : '';
    fetch(`/api/public/articles${q}`)
      .then((r) => r.json())
      .then((d) => {
        setArticles(d.articles || []);
        if (d.categories?.length) setCategories(d.categories);
      })
      .finally(() => setLoading(false));
  }, [activeCategory]);

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

      <section className="bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-medium uppercase tracking-wider text-[#00D4FF]">
            NexaFlow Insights
          </p>
          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight">
            Insights &amp; Technical Resources
          </h1>
          <p className="mt-4 text-base text-[#AEB8D4] max-w-2xl leading-relaxed">
            Practical engineering articles, architecture notes, and learning resources published by NexaFlow Technologies.
          </p>
        </div>
      </section>

      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {categories.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-8">
              {['All', ...categories].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeCategory === cat
                      ? 'bg-[#176BFF] text-white'
                      : 'border border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-[#F7F8FF]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">Loading articles...</div>
          ) : articles.length === 0 ? (
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-12 text-center max-w-2xl mx-auto">
              <FileText className="w-8 h-8 mx-auto text-[#176BFF] dark:text-[#00D4FF] mb-3" />
              <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                No articles published yet
              </h2>
              <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                Published articles authored in the CMS will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => (
                <article
                  key={article.slug}
                  className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    {article.featuredImage && (
                      <div className="aspect-video bg-[#03051B]">
                        <MediaImage
                          src={article.featuredImage}
                          alt={article.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-6">
                      <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex items-center gap-2">
                        <span>{article.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>{article.readingTimeMinutes} min read</span>
                        {article.publishedAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                      <h2 className="mt-2.5 text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                        {article.title}
                      </h2>
                      <p className="mt-2 text-sm text-[#4A5578] dark:text-[#AEB8D4] line-clamp-3">
                        {article.excerpt}
                      </p>
                    </div>
                  </div>
                  <div className="px-6 pb-6">
                    <button
                      type="button"
                      onClick={() => navigate(`/insights/${article.slug}`)}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                    >
                      Read article
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
