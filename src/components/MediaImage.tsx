import { useEffect, useMemo, useState } from 'react';
import { Layers } from 'lucide-react';
import {
  buildImageProxyPath,
  needsServerImageResolution,
  normalizeImageUrl,
  parseImgurUrl,
} from '../utils/media';

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
  const [attemptIndex, setAttemptIndex] = useState(0);

  useEffect(() => {
    setAttemptIndex(0);
  }, [src]);

  const candidates = useMemo(() => {
    const raw = String(src || '').trim();
    if (!raw) return [];

    // Local app asset paths
    if (raw.startsWith('/') && !raw.startsWith('//')) {
      return [raw];
    }

    const normalized = normalizeImageUrl(raw);
    const list: string[] = [];

    if (needsServerImageResolution(raw)) {
      // Imgur album/gallery or wrapper URL -> resolve & proxy directly via backend
      list.push(buildImageProxyPath(raw));
      return list;
    }

    if (normalized) {
      list.push(normalized);
    }

    // For Imgur single-ID URLs without an explicit extension, also include png/webp/proxy fallbacks
    const imgur = parseImgurUrl(raw);
    if (imgur.isImgur && imgur.id && imgur.kind === 'single') {
      const pngUrl = `https://i.imgur.com/${imgur.id}.png`;
      if (!list.includes(pngUrl)) list.push(pngUrl);
    }

    // Same-origin SSRF-safe proxy fallback bypasses Imgur / CDN browser hotlink or referer blocks
    const proxyTarget = normalized || raw;
    if (/^https?:\/\//i.test(proxyTarget)) {
      list.push(buildImageProxyPath(proxyTarget));
    }

    return list;
  }, [src]);

  const activeSrc = candidates[attemptIndex];

  if (!activeSrc) {
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

  const normalizedLocalPath = activeSrc.split('?')[0];
  const isResponsiveLocal = LOCAL_RESPONSIVE_IMAGES.has(normalizedLocalPath);
  const isSingleLocalWebp = LOCAL_SINGLE_WEBP.has(normalizedLocalPath);

  const handleError = () => {
    setAttemptIndex((prev) => prev + 1);
  };

  if (isResponsiveLocal) {
    const base = normalizedLocalPath.replace(/\.jpg$/i, '');
    return (
      <picture className="block w-full h-full">
        <source
          type="image/webp"
          srcSet={`${base}-sm.webp 640w, ${base}.webp 1200w`}
          sizes={sizes}
        />
        <img
          src={activeSrc}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding={loading === 'eager' ? 'sync' : 'async'}
          fetchPriority={fetchPriority}
          referrerPolicy="no-referrer"
          onError={handleError}
          className={className}
        />
      </picture>
    );
  }

  if (isSingleLocalWebp) {
    const webpSrc = normalizedLocalPath.replace(/\.png$/i, '.webp');
    return (
      <picture>
        <source type="image/webp" srcSet={webpSrc} />
        <img
          src={activeSrc}
          alt={alt}
          width={width}
          height={height}
          loading={loading}
          decoding={loading === 'eager' ? 'sync' : 'async'}
          fetchPriority={fetchPriority}
          referrerPolicy="no-referrer"
          onError={handleError}
          className={className}
        />
      </picture>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding={loading === 'eager' ? 'sync' : 'async'}
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
    />
  );
}
