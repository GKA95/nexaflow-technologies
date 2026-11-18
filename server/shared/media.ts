export interface ParsedImgurUrl {
  isImgur: boolean;
  kind: 'direct' | 'single' | 'album' | 'gallery' | 'other';
  id?: string;
  extension?: string;
  normalizedDirectUrl?: string;
  canonicalPageUrl?: string;
}

const IMGUR_RESERVED_SEGMENTS = new Set([
  'a',
  'gallery',
  't',
  'topic',
  'user',
  'account',
  'upload',
  'register',
  'signin',
  'login',
  'search',
  'new',
  'hot',
  'top',
  'blog',
  'about',
  'tos',
  'privacy',
  'jobs',
  'apps',
]);

const IMGUR_EXT_RE = /^([A-Za-z0-9]{4,14})\.(jpg|jpeg|png|webp|gif|gifv)$/i;
const IMGUR_ID_RE = /^[A-Za-z0-9]{4,14}$/;

/**
 * Inspects an Imgur URL and classifies whether it is already a direct CDN link,
 * a single-image viewer page (imgur.com/<id>), or an album/gallery page (/a/<id>, /gallery/<id>).
 */
export function parseImgurUrl(rawUrl: string): ParsedImgurUrl {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return { isImgur: false, kind: 'other' };

  const withScheme =
    /^imgur\.com\//i.test(trimmed) ||
    /^(?:www\.|m\.|i\.)imgur\.com\//i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { isImgur: false, kind: 'other' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host !== 'imgur.com' &&
    host !== 'www.imgur.com' &&
    host !== 'm.imgur.com' &&
    host !== 'i.imgur.com'
  ) {
    return { isImgur: false, kind: 'other' };
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  const segments = pathname.split('/').filter(Boolean);

  if (host === 'i.imgur.com') {
    if (segments.length === 1) {
      const seg = segments[0];
      const extMatch = seg.match(IMGUR_EXT_RE);
      if (extMatch) {
        const id = extMatch[1];
        const rawExt = extMatch[2].toLowerCase();
        const ext = rawExt === 'gifv' ? 'gif' : rawExt;
        return {
          isImgur: true,
          kind: 'direct',
          id,
          extension: ext,
          normalizedDirectUrl: `https://i.imgur.com/${id}.${ext}`,
          canonicalPageUrl: `https://imgur.com/${id}`,
        };
      }
      if (IMGUR_ID_RE.test(seg)) {
        return {
          isImgur: true,
          kind: 'single',
          id: seg,
          extension: 'jpg',
          normalizedDirectUrl: `https://i.imgur.com/${seg}.jpg`,
          canonicalPageUrl: `https://imgur.com/${seg}`,
        };
      }
    }
    return {
      isImgur: true,
      kind: 'direct',
      normalizedDirectUrl: `https://i.imgur.com${pathname}`,
    };
  }

  // Host is imgur.com / www.imgur.com / m.imgur.com
  if (segments.length === 1) {
    const seg = segments[0];
    const extMatch = seg.match(IMGUR_EXT_RE);
    if (extMatch) {
      const id = extMatch[1];
      const rawExt = extMatch[2].toLowerCase();
      const ext = rawExt === 'gifv' ? 'gif' : rawExt;
      return {
        isImgur: true,
        kind: 'single',
        id,
        extension: ext,
        normalizedDirectUrl: `https://i.imgur.com/${id}.${ext}`,
        canonicalPageUrl: `https://imgur.com/${id}`,
      };
    }
    if (IMGUR_ID_RE.test(seg) && !IMGUR_RESERVED_SEGMENTS.has(seg.toLowerCase())) {
      return {
        isImgur: true,
        kind: 'single',
        id: seg,
        extension: 'jpg',
        normalizedDirectUrl: `https://i.imgur.com/${seg}.jpg`,
        canonicalPageUrl: `https://imgur.com/${seg}`,
      };
    }
  }

  if (segments[0] === 'a' && segments[1]) {
    const id = segments[1].split('-').pop() || segments[1];
    return {
      isImgur: true,
      kind: 'album',
      id,
      canonicalPageUrl: `https://imgur.com/a/${segments[1]}`,
    };
  }

  if (segments[0] === 'gallery' && segments[1]) {
    const slugPart = segments[1];
    const id = slugPart.includes('-') ? slugPart.split('-').pop() : slugPart;
    return {
      isImgur: true,
      kind: 'gallery',
      id,
      canonicalPageUrl: `https://imgur.com/gallery/${slugPart}`,
    };
  }

  if (segments[0] === 't' && segments[2]) {
    const slugPart = segments[2];
    const id = slugPart.includes('-') ? slugPart.split('-').pop() : slugPart;
    return {
      isImgur: true,
      kind: 'gallery',
      id,
      canonicalPageUrl: `https://imgur.com/t/${segments[1]}/${slugPart}`,
    };
  }

  return {
    isImgur: true,
    kind: 'other',
    canonicalPageUrl: `https://imgur.com${pathname}`,
  };
}

/**
 * Normalizes common external image URLs (Imgur single-image links, i.imgur.com without extension,
 * Google Drive share URLs, Dropbox share URLs, and insecure http:// links on supported CDNs)
 * into clean direct image URLs.
 */
export function normalizeImageUrl(rawUrl?: string | null): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';

  // Keep relative site paths cleanly
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  // Handle protocol-relative URLs
  const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;

  // Imgur handling
  const imgur = parseImgurUrl(candidate);
  if (imgur.isImgur) {
    if (imgur.normalizedDirectUrl) {
      return imgur.normalizedDirectUrl;
    }
    if (imgur.canonicalPageUrl) {
      return imgur.canonicalPageUrl;
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return trimmed;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '';
  }

  const host = parsed.hostname.toLowerCase();

  // Google Drive share links -> direct view URL
  if (host === 'drive.google.com') {
    const fileMatch = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
    const id = fileMatch?.[1] || parsed.searchParams.get('id');
    if (id) {
      return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
    }
  }

  // Dropbox share links -> direct raw image
  if (host === 'www.dropbox.com' || host === 'dropbox.com') {
    parsed.protocol = 'https:';
    parsed.searchParams.delete('dl');
    parsed.searchParams.set('raw', '1');
    return parsed.toString();
  }

  return parsed.toString();
}

/**
 * Returns true if the URL points to a page wrapper (such as an Imgur album/gallery page)
 * that requires server-side HTML/oEmbed inspection rather than direct <img> rendering.
 */
export function needsServerImageResolution(rawUrl?: string | null): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) return false;
  const imgur = parseImgurUrl(trimmed);
  if (imgur.isImgur && (imgur.kind === 'album' || imgur.kind === 'gallery' || imgur.kind === 'other')) {
    return !imgur.normalizedDirectUrl;
  }
  return false;
}

export function buildImageProxyPath(rawUrl: string): string {
  return `/api/public/image-proxy?url=${encodeURIComponent(rawUrl)}`;
}
