import { useState } from 'react';
import { Layers } from 'lucide-react';

interface MediaImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

export function MediaImage({
  src,
  alt,
  className = '',
  fallbackLabel,
  loading = 'lazy',
  fetchPriority = 'auto',
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

  return (
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      fetchPriority={fetchPriority}
      referrerPolicy="no-referrer"
      onError={() => setErrored(true)}
      className={className}
    />
  );
}
