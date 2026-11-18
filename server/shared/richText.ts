const HTML_TAG_DETECT_RE =
  /<\/?(?:p|br|h[1-6]|div|span|strong|b|em|i|u|s|sub|sup|ul|ol|li|blockquote|pre|code|hr|a|img|table|thead|tbody|tr|th|td|mark|figure|figcaption)\b[^>]*>/i;

const BLOCK_BOUNDARY_RE =
  /<\/(?:p|div|h[1-6]|li|blockquote|pre|tr|th|td|section|article|figcaption)>|<br\s*\/?>/gi;

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&mdash;': '—',
  '&ndash;': '–',
};

export function isHtmlContent(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return HTML_TAG_DETECT_RE.test(value);
}

export function extractPlainText(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '';
  if (!isHtmlContent(value)) {
    return value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
  }

  let text = value
    .replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK_BOUNDARY_RE, ' ')
    .replace(/<[^>]*>/g, '');

  text = text.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|rsquo|lsquo|ldquo|rdquo|mdash|ndash);/gi,
    (match) => HTML_ENTITIES[match.toLowerCase()] || ' '
  );
  text = text.replace(/&#(\d+);/g, (_m, code) => {
    const num = Number(code);
    return Number.isFinite(num) && num > 0 && num < 0x10ffff ? String.fromCharCode(num) : ' ';
  });

  return text.replace(/\s+/g, ' ').trim();
}

export function countWordsFromRichContent(value: string | undefined | null): number {
  const plain = extractPlainText(value);
  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingTimeMinutes(value: string | undefined | null): number {
  const words = countWordsFromRichContent(value);
  return Math.max(1, Math.ceil(words / 200));
}

function escapeHtmlBasic(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts legacy plain-text CMS content (separated by newlines) into clean semantic <p> HTML
 * when loading an existing record into the rich-text editor.
 */
export function plainTextToHtml(value: string | undefined | null): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (isHtmlContent(trimmed)) return trimmed;

  const paragraphs = trimmed.split(/\n{2,}/);
  return paragraphs
    .map((block) => {
      const lines = block
        .split('\n')
        .map((line) => escapeHtmlBasic(line))
        .join('<br />');
      return `<p>${lines}</p>`;
    })
    .join('');
}
