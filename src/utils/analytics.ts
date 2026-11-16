declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    __nfGaInitialized?: string;
  }
}

const ATTRIBUTION_KEY = 'nf-attribution';

export interface AttributionData {
  landingPage: string;
  referringUrl: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  utmTerm: string;
  utmContent: string;
  source: string;
}

export function captureAttribution() {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source') || '';
    const utmMedium = params.get('utm_medium') || '';
    const utmCampaign = params.get('utm_campaign') || '';
    const utmTerm = params.get('utm_term') || '';
    const utmContent = params.get('utm_content') || '';

    const existingRaw = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (!existingRaw || utmSource) {
      let source = 'direct';
      if (utmSource) source = utmSource;
      else if (document.referrer) {
        try {
          source = new URL(document.referrer).hostname;
        } catch {
          source = 'referral';
        }
      }

      const payload: AttributionData = {
        landingPage: window.location.pathname + window.location.search,
        referringUrl: document.referrer || '',
        utmSource,
        utmMedium,
        utmCampaign,
        utmTerm,
        utmContent,
        source,
      };
      sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(payload));
    }
  } catch {
    // ignore storage restriction
  }
}

export function getLeadAttribution(): AttributionData {
  if (typeof window === 'undefined') {
    return {
      landingPage: '/',
      referringUrl: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      utmTerm: '',
      utmContent: '',
      source: 'direct',
    };
  }
  try {
    const raw = sessionStorage.getItem(ATTRIBUTION_KEY);
    if (raw) return JSON.parse(raw) as AttributionData;
  } catch {
    // ignore
  }
  return {
    landingPage: window.location.pathname,
    referringUrl: document.referrer || '',
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
    utmTerm: '',
    utmContent: '',
    source: 'direct',
  };
}

export function initGoogleAnalytics(measurementId: string, consentAccepted: boolean) {
  if (!consentAccepted || !measurementId || typeof window === 'undefined') return;
  const cleanId = measurementId.trim();
  if (!/^G-[A-Z0-9]+$/i.test(cleanId)) return;
  if (window.__nfGaInitialized === cleanId) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  window.gtag('js', new Date());
  window.gtag('config', cleanId, { anonymize_ip: true });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cleanId)}`;
  document.head.appendChild(script);
  window.__nfGaInitialized = cleanId;
}

export function trackEvent(
  eventType: string,
  options?: {
    path?: string;
    entitySlug?: string;
    consentAccepted?: boolean;
    params?: Record<string, unknown>;
  }
) {
  if (!options?.consentAccepted || typeof window === 'undefined') return;

  if (typeof window.gtag === 'function') {
    window.gtag('event', eventType, {
      page_path: options.path || window.location.pathname,
      ...options.params,
    });
  }

  const attr = getLeadAttribution();
  fetch('/api/public/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType,
      path: options.path || window.location.pathname,
      entitySlug: options.entitySlug || '',
      referrer: attr.referringUrl,
      utmSource: attr.utmSource || attr.source,
    }),
  }).catch(() => {});
}
