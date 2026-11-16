import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import type { PageMetaConfig } from '../types';

interface SEOHeadProps extends PageMetaConfig {
  title?: string;
  description?: string;
}

export function SEOHead({
  title,
  description,
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogImage,
  ogType,
  keywords,
  noIndex,
  structuredData,
}: SEOHeadProps) {
  const { setPageMeta } = useApp();

  const keywordsKey = Array.isArray(keywords) ? keywords.join(',') : keywords || '';
  const structuredDataKey = structuredData ? JSON.stringify(structuredData) : '';

  useEffect(() => {
    setPageMeta({
      title,
      description,
      canonicalUrl,
      ogTitle,
      ogDescription,
      ogImage,
      ogType,
      keywords,
      noIndex,
      structuredData: structuredDataKey ? JSON.parse(structuredDataKey) : undefined,
    });

    return () => {
      setPageMeta(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setPageMeta,
    title,
    description,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    keywordsKey,
    noIndex,
    structuredDataKey,
  ]);

  return null;
}
