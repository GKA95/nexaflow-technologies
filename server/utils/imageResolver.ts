import dns from 'node:dns/promises';
import net from 'node:net';
import { normalizeImageUrl, parseImgurUrl } from '../shared/media.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const BROWSER_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (compatible; NexaFlowMediaBot/1.0; +https://nexaflow.tech)',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    num = (num << 8) + n;
  }
  return num >>> 0;
}

function inIpv4Cidr(ipInt: number, base: string, prefix: number): boolean {
  const baseInt = ipv4ToInt(base);
  if (baseInt === null) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const trimmed = String(rawIp || '').trim().replace(/^\[|\]$/g, '');
  if (!trimmed) return true;

  const zoneIdx = trimmed.indexOf('%');
  const ip = zoneIdx >= 0 ? trimmed.slice(0, zoneIdx) : trimmed;

  const family = net.isIP(ip);
  if (family === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    return (
      inIpv4Cidr(n, '0.0.0.0', 8) ||
      inIpv4Cidr(n, '10.0.0.0', 8) ||
      inIpv4Cidr(n, '100.64.0.0', 10) ||
      inIpv4Cidr(n, '127.0.0.0', 8) ||
      inIpv4Cidr(n, '169.254.0.0', 16) ||
      inIpv4Cidr(n, '172.16.0.0', 12) ||
      inIpv4Cidr(n, '192.0.0.0', 24) ||
      inIpv4Cidr(n, '192.0.2.0', 24) ||
      inIpv4Cidr(n, '192.168.0.0', 16) ||
      inIpv4Cidr(n, '198.18.0.0', 15) ||
      inIpv4Cidr(n, '198.51.100.0', 24) ||
      inIpv4Cidr(n, '203.0.113.0', 24) ||
      inIpv4Cidr(n, '224.0.0.0', 4) ||
      inIpv4Cidr(n, '240.0.0.0', 4)
    );
  }

  if (family === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (lower.startsWith('::ffff:')) {
      return isPrivateOrReservedIp(lower.slice(7));
    }
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // Unique local fc00::/7
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    ) {
      return true; // Link-local fe80::/10
    }
    if (lower.startsWith('ff')) return true; // Multicast ff00::/8
    return false;
  }

  return true;
}

export async function assertPublicSafeUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are permitted.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Embedded credentials in URLs are not permitted.');
  }
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    throw new Error('Non-standard HTTP ports are not permitted.');
  }

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa')
  ) {
    throw new Error('Private or internal hostnames are not permitted.');
  }

  // If hostname itself is an IP literal, validate immediately
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error('Private or reserved IP addresses are not permitted.');
    }
    return parsed;
  }

  // DNS resolution check (guards against internal host records & numeric aliases)
  const records = await dns.lookup(host, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error('Could not resolve external image host.');
  }
  for (const record of records) {
    if (isPrivateOrReservedIp(record.address)) {
      throw new Error('Resolved IP address belongs to a private or reserved network.');
    }
  }

  return parsed;
}

async function safeFetchWithRedirectGuard(
  initialUrl: string,
  acceptHeader: string
): Promise<{ response: globalThis.Response; finalUrl: string }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const safeUrl = await assertPublicSafeUrl(currentUrl);
    const response = await fetch(safeUrl.toString(), {
      method: 'GET',
      redirect: 'manual',
      headers: {
        ...BROWSER_FETCH_HEADERS,
        Accept: acceptHeader,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error('Upstream redirect missing location.');
      }
      currentUrl = new URL(location, safeUrl).toString();
      continue;
    }

    return { response, finalUrl: safeUrl.toString() };
  }

  throw new Error('Too many redirects fetching external image.');
}

async function readResponseBufferLimited(
  response: globalThis.Response,
  maxBytes: number
): Promise<Buffer> {
  const declaredLen = Number(response.headers.get('content-length') || '0');
  if (declaredLen > maxBytes) {
    throw new Error('External file exceeds maximum allowed size.');
  }

  if (!response.body) {
    const arr = await response.arrayBuffer();
    if (arr.byteLength > maxBytes) {
      throw new Error('External file exceeds maximum allowed size.');
    }
    return Buffer.from(arr);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error('External file exceeds maximum allowed size.');
      }
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

function extractImgurDirectUrlFromHtml(html: string): string | null {
  // Check og:image and twitter:image meta tags first
  const metaPatterns = [
    /<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image(?::secure_url)?["']/i,
    /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']twitter:image(?::src)?["']/i,
  ];

  for (const re of metaPatterns) {
    const match = html.match(re);
    const candidate = match?.[1]?.trim();
    if (candidate && /^https?:\/\/i\.imgur\.com\/[A-Za-z0-9]{4,14}\.(jpg|jpeg|png|webp|gif)/i.test(candidate)) {
      return candidate.split('?')[0].replace(/^http:\/\//i, 'https://');
    }
  }

  // Fallback: match direct i.imgur.com image asset URL inside embedded JSON/page payload
  const directMatch = html.match(
    /https?:\/\/i\.imgur\.com\/([A-Za-z0-9]{5,12})\.(jpg|jpeg|png|webp|gif)/i
  );
  if (directMatch) {
    return `https://i.imgur.com/${directMatch[1]}.${directMatch[2].toLowerCase()}`;
  }

  return null;
}

/**
 * Resolves Imgur page / album / gallery URLs into direct https://i.imgur.com/... image URLs
 * when saving in admin or fetching via the image proxy. Never throws on transient network failure.
 */
export async function resolveImageUrlForStorage(rawUrl?: string | null): Promise<string> {
  const normalized = normalizeImageUrl(rawUrl);
  if (!normalized || normalized.startsWith('/')) {
    return normalized;
  }

  const imgur = parseImgurUrl(rawUrl || normalized);
  if (!imgur.isImgur) {
    return normalized;
  }

  // Direct/single URL (e.g., https://i.imgur.com/abc1234.jpg or converted from imgur.com/abc1234)
  if (imgur.normalizedDirectUrl && (imgur.kind === 'direct' || imgur.kind === 'single')) {
    return imgur.normalizedDirectUrl;
  }

  // Album or Gallery URL (imgur.com/a/... or imgur.com/gallery/...) -> resolve via oEmbed then HTML og:image
  const pageUrl = imgur.canonicalPageUrl || normalized;
  try {
    const oembedUrl = `https://api.imgur.com/oembed.json?url=${encodeURIComponent(pageUrl)}`;
    const { response: oembedRes } = await safeFetchWithRedirectGuard(
      oembedUrl,
      'application/json,text/plain,*/*'
    );
    if (oembedRes.ok) {
      const json = (await oembedRes.json().catch(() => null)) as {
        url?: string;
        thumbnail_url?: string;
      } | null;
      const candidate = json?.url || json?.thumbnail_url;
      if (candidate && /^https?:\/\/i\.imgur\.com\//i.test(candidate)) {
        return normalizeImageUrl(candidate);
      }
    }
  } catch {
    // Fallback cleanly to HTML inspection below
  }

  try {
    const { response: htmlRes } = await safeFetchWithRedirectGuard(
      pageUrl,
      'text/html,application/xhtml+xml,*/*;q=0.8'
    );
    if (htmlRes.ok) {
      const buf = await readResponseBufferLimited(htmlRes, 512 * 1024);
      const extracted = extractImgurDirectUrlFromHtml(buf.toString('utf8'));
      if (extracted) {
        return normalizeImageUrl(extracted);
      }
    }
  } catch {
    // Graceful fallback below
  }

  return normalized;
}

export interface ProxiedImagePayload {
  buffer: Buffer;
  contentType: string;
  resolvedUrl: string;
}

/**
 * Fetches an external raster image safely (SSRF-protected, size-limited, MIME-checked),
 * automatically resolving Imgur page/album/gallery links first.
 */
export async function fetchSafeExternalImage(rawUrl: string): Promise<ProxiedImagePayload> {
  const resolvedUrl = await resolveImageUrlForStorage(rawUrl);
  if (!resolvedUrl || !/^https?:\/\//i.test(resolvedUrl)) {
    throw new Error('Enter a valid external http(s) image URL.');
  }

  const { response, finalUrl } = await safeFetchWithRedirectGuard(
    resolvedUrl,
    'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5'
  );

  if (!response.ok) {
    throw new Error(`Upstream image server responded with HTTP ${response.status}.`);
  }

  const rawContentType = (response.headers.get('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();

  // If Imgur redirected/served HTML for an unresolved URL, try extracting og:image once more
  if (rawContentType === 'text/html' && parseImgurUrl(finalUrl).isImgur) {
    const htmlBuf = await readResponseBufferLimited(response, 512 * 1024);
    const extracted = extractImgurDirectUrlFromHtml(htmlBuf.toString('utf8'));
    if (!extracted) {
      throw new Error('Could not locate a direct image inside the Imgur page.');
    }
    const retry = await safeFetchWithRedirectGuard(
      extracted,
      'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.5'
    );
    if (!retry.response.ok) {
      throw new Error(`Upstream image server responded with HTTP ${retry.response.status}.`);
    }
    const retryMime = (retry.response.headers.get('content-type') || '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(retryMime)) {
      throw new Error('External URL did not return a supported raster image format.');
    }
    const imgBuf = await readResponseBufferLimited(retry.response, MAX_IMAGE_BYTES);
    return { buffer: imgBuf, contentType: retryMime, resolvedUrl: retry.finalUrl };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.has(rawContentType)) {
    throw new Error('External URL did not return a supported raster image format.');
  }

  const buffer = await readResponseBufferLimited(response, MAX_IMAGE_BYTES);
  return { buffer, contentType: rawContentType, resolvedUrl: finalUrl };
}
