import { useState } from 'react';
import { Layers } from 'lucide-react';

interface MediaImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
  sizes?: string;
  width?: number;
  height?: number;
}

const LOCAL_RESPONSIVE_IMAGES = new Set([
  '/assets/images/hero_nexaflow_architecture.jpg',
  '/assets/images/product_gridmind_ai.jpg',
  '/assets/images/service_ai_automation.jpg',
  '/assets/images/service_data_analytics.jpg',
]);

const LOCAL_SINGLE_WEBP = new Set([
  '/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png',
  '/assets/aistudio/nexaflow_icon_512_4fc8acbf.png',
]);

export function MediaImage({
  src,
  alt,
  className = '',
  fallbackLabel,
  loading = 'lazy',
  fetchPriority = 'auto',
  sizes = '(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 42vw',
  width,
  height,
}: MediaImageProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#080D2B] via-[#10183A] to-[#03051B] border border-[#1A2550] text-[#AEB8D4] p-6 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Layers className="w-8 h-8 text-[#00D4FF] mb-2 opacity-80" />
        <span className="text-xs font-medium text-center max-w-xs text-[#AEB8D4]">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  const normalizedSrc = src.split('?')[0];
  const isResponsiveLocal = LOCAL_RESPONSIVE_IMAGES.has(normalizedSrc);
  const isSingleLocalWebp = LOCAL_SINGLE_WEBP.has(normalizedSrc);

  if (isResponsiveLocal) {
    const base = normalizedSrc.replace(/\.jpg$/i, '');
    return (
      <picture className="block w-full h-full">
        <source
          type="image/webp"
          srcSet={`${base}-sm.webp 640w, ${base}.webp 1200w`}
          sizes={sizes}
        />
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding={loading === 'eager' ? 'sync' : 'async'}
          fetchPriority={fetchPriority}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className={className}
        />
      </picture>
    );
  }

  if (isSingleLocalWebp) {
    const webpSrc = normalizedSrc.replace(/\.png$/i, '.webp');
    return (
      <picture>
        <source type="image/webp" srcSet={webpSrc} />
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding={loading === 'eager' ? 'sync' : 'async'}
          fetchPriority={fetchPriority}
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className={className}
        />
      </picture>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={loading === 'eager' ? 'sync' : 'async'}
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
