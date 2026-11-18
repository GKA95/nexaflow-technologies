import sanitizeHtml from 'sanitize-html';
import { normalizeImageUrl } from '../shared/media.js';
import { extractPlainText, isHtmlContent } from '../shared/richText.js';

const ALLOWED_FONT_FAMILY_RE =
  /^(?:["']?(?:Plus Jakarta Sans|DM Sans|JetBrains Mono|Georgia|serif|sans-serif|monospace)["']?(?:\s*,\s*(?:["']?[A-Za-z0-9\s-]+["']?))*)$/i;

const ALLOWED_COLOR_RE =
  /^(?:#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\)|transparent|inherit)$/i;

const ALLOWED_FONT_SIZE_RE = /^(?:12|13|14|15|16|18|20|22|24|28|32)px$/;
const ALLOWED_ALIGN_RE = /^(?:left|center|right|justify)$/i;

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
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
    'del',
    'sub',
    'sup',
    'mark',
    'ul',
    'ol',
    'li',
    'blockquote',
    'pre',
    'code',
    'hr',
    'a',
    'img',
    'figure',
    'figcaption',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'div',
  ],
  allowedAttributes: {
    '*': ['style'],
    a: ['href', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'data-align', 'loading'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    mark: ['data-color', 'style'],
    pre: ['class'],
    code: ['class'],
    figure: ['data-align', 'style'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href', 'src'],
  allowProtocolRelative: false,
  allowedStyles: {
    '*': {
      color: [ALLOWED_COLOR_RE],
      'background-color': [ALLOWED_COLOR_RE],
      'text-align': [ALLOWED_ALIGN_RE],
      'font-family': [ALLOWED_FONT_FAMILY_RE],
      'font-size': [ALLOWED_FONT_SIZE_RE],
    },
  },
  transformTags: {
    a: (tagName, attribs) => {
      const href = (attribs.href || '').trim();
      const isExternal = /^https?:\/\//i.test(href);
      return {
        tagName,
        attribs: {
          ...attribs,
          href,
          ...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
        },
      };
    },
    img: (tagName, attribs) => {
      const src = normalizeImageUrl(attribs.src || '');
      if (
        !src ||
        (!src.startsWith('/') && !/^https?:\/\//i.test(src))
      ) {
        return { tagName: 'span', attribs: {} };
      }
      const align = ['left', 'center', 'right'].includes(attribs['data-align'] || '')
        ? attribs['data-align']
        : 'center';
      return {
        tagName,
        attribs: {
          src,
          alt: String(attribs.alt || '').slice(0, 300),
          ...(attribs.title ? { title: String(attribs.title).slice(0, 200) } : {}),
          'data-align': align,
          loading: 'lazy',
        },
      };
    },
  },
};

/**
 * Sanitizes rich HTML created by the CMS Tiptap editor while keeping plain text intact
 * for legacy/unformatted entries.
 */
export function sanitizeRichHtml(input: string | undefined | null): string {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return '';
  if (!isHtmlContent(raw)) {
    // Strip stray angle brackets from unformatted text safely
    return raw.replace(/<[^>]*>/g, '').trim();
  }

  const cleaned = sanitizeHtml(raw, SANITIZE_OPTIONS).trim();
  const plain = extractPlainText(cleaned);
  if (!plain && !/<img\b|<hr\b/i.test(cleaned)) {
    return '';
  }
  return cleaned;
}
