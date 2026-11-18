import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { isHtmlContent } from '../../server/shared/richText';

const ALLOWED_TAGS = [
  'p',
  'br',
  'h1',
  'h2',
  'h3',
  'h4',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'mark',
  'span',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'hr',
  'a',
  'img',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'src',
  'alt',
  'title',
  'style',
  'class',
  'data-align',
  'data-color',
  'colspan',
  'rowspan',
];

function sanitizeAndFormatHtml(raw: string): string {
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|\/(?!\/)|data:image\/(?:png|jpeg|jpg|gif|webp);base64,)/i,
  });

  // Normalize external anchor rel attributes & wrap tables for responsive horizontal scrolling
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return clean;
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(clean, 'text/html');

    doc.querySelectorAll('a').forEach((anchor) => {
      const href = anchor.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      }
    });

    doc.querySelectorAll('img').forEach((img) => {
      img.setAttribute('loading', 'lazy');
      img.setAttribute('decoding', 'async');
      img.setAttribute('referrerpolicy', 'no-referrer');
    });

    doc.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('nf-rich-table-wrap')) return;
      const wrapper = doc.createElement('div');
      wrapper.className = 'nf-rich-table-wrap';
      table.parentNode?.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });

    return doc.body.innerHTML;
  } catch {
    return clean;
  }
}

export function RichContentRenderer({
  content,
  className = '',
  compact = false,
  surface = 'auto',
  emptyFallback = null,
}: {
  content?: string | null;
  className?: string;
  compact?: boolean;
  surface?: 'auto' | 'light' | 'dark';
  emptyFallback?: string | null;
}) {
  const trimmed = typeof content === 'string' ? content.trim() : '';
  const isHtml = useMemo(() => isHtmlContent(trimmed), [trimmed]);
  const sanitizedHtml = useMemo(() => {
    if (!trimmed || !isHtml) return '';
    return sanitizeAndFormatHtml(trimmed);
  }, [trimmed, isHtml]);

  if (!trimmed) {
    if (!emptyFallback) return null;
    return (
      <p className={`text-sm text-[#4A5578] dark:text-[#AEB8D4] ${className}`}>
        {emptyFallback}
      </p>
    );
  }

  const surfaceClass =
    surface === 'dark' ? 'nf-rich-surface-dark' : '';
  const compactClass = compact ? 'nf-rich-compact' : '';

  if (isHtml) {
    return (
      <div
        className={`nf-rich-content ${compactClass} ${surfaceClass} ${className}`.trim()}
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  const paragraphs = trimmed.split(/\n{2,}/).filter(Boolean);

  return (
    <div className={`nf-rich-content ${compactClass} ${surfaceClass} ${className}`.trim()}>
      {paragraphs.map((para, idx) => (
        <p key={idx} className="whitespace-pre-line">
          {para}
        </p>
      ))}
    </div>
  );
}
