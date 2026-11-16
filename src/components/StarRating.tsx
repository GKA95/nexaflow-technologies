import { useState } from 'react';
import { Star } from 'lucide-react';

export function StarRatingDisplay({
  rating,
  count,
  size = 'sm',
  showEmptyLabel = true,
  className = '',
}: {
  rating?: number;
  count?: number;
  size?: 'xs' | 'sm' | 'md';
  showEmptyLabel?: boolean;
  className?: string;
}) {
  const safeCount = Number(count || 0);
  const safeRating = Number(rating || 0);
  const iconClass =
    size === 'xs' ? 'w-3.5 h-3.5' : size === 'md' ? 'w-5 h-5' : 'w-4 h-4';

  if (safeCount === 0 && !safeRating) {
    if (!showEmptyLabel) return null;
    return (
      <div className={`inline-flex items-center gap-1.5 text-xs text-[#4A5578] dark:text-[#AEB8D4] ${className}`}>
        <div className="flex items-center gap-0.5" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} className={`${iconClass} text-[#CBD5E1] dark:text-[#2A3768]`} />
          ))}
        </div>
        <span>No reviews yet</span>
      </div>
    );
  }

  const rounded = Math.round(safeRating);

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs ${className}`}
      aria-label={`Rated ${safeRating.toFixed(1)} out of 5 stars${safeCount > 0 ? ` from ${safeCount} reviews` : ''}`}
    >
      <div className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            className={`${iconClass} ${
              n <= rounded
                ? 'fill-amber-400 text-amber-400'
                : 'text-[#CBD5E1] dark:text-[#2A3768]'
            }`}
          />
        ))}
      </div>
      <span className="font-mono font-semibold tabular-nums text-[#070B24] dark:text-[#F7F8FF]">
        {safeRating.toFixed(1)}
      </span>
      {typeof count === 'number' && (
        <span className="text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
          ({safeCount} {safeCount === 1 ? 'review' : 'reviews'})
        </span>
      )}
    </div>
  );
}

export function StarRatingPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  const [hovered, setHovered] = useState(0);
  const display = hovered || value;

  const labels = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Course star rating">
        {[1, 2, 3, 4, 5].map((star) => {
          const active = star <= display;
          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} ${star === 1 ? 'star' : 'stars'}`}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => onChange(star)}
              className="p-1 rounded-md transition-transform hover:scale-110 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[#00D4FF]"
            >
              <Star
                className={`w-7 h-7 transition-colors ${
                  active
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-[#CBD5E1] dark:text-[#2A3768]'
                }`}
              />
            </button>
          );
        })}
      </div>
      {display > 0 && (
        <span className="text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4]">
          {display}/5 · {labels[display]}
        </span>
      )}
    </div>
  );
}
