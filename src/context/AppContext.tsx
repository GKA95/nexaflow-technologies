import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  AppliedCoupon,
  ArticleItem,
  AuthUser,
  CourseItem,
  PageMetaConfig,
  ProductItem,
  ResolvedMetaTags,
  SEOPageItem,
  ServiceItem,
  SiteSettings,
  TestimonialItem,
  WorkShowcaseItem,
} from '../types';
import { captureAttribution, initGoogleAnalytics, trackEvent } from '../utils/analytics';
import {
  apiFetch,
  clearStoredSessionToken,
  setStoredSessionToken,
} from '../utils/authSession';
import { applyDocumentHeadMeta, resolveRouteMeta } from '../utils/metaTags';

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

type ConsentState = 'unset' | 'accepted' | 'declined';

interface AppContextValue {
  currentPath: string;
  searchParams: URLSearchParams;
  navigate: (to: string) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  user: AuthUser | null;
  authLoading: boolean;
  refreshAuth: () => Promise<AuthUser | null>;
  setAuthenticatedSession: (nextUser: AuthUser | null, sessionToken?: string) => void;
  logout: () => Promise<void>;
  dbConnected: boolean;
  settings: SiteSettings | null;
  services: ServiceItem[];
  products: ProductItem[];
  featuredCourses: CourseItem[];
  featuredArticles: ArticleItem[];
  workItems: WorkShowcaseItem[];
  testimonials: TestimonialItem[];
  seoPages: SEOPageItem[];
  bootstrapLoading: boolean;
  refreshBootstrap: () => Promise<void>;
  consent: ConsentState;
  setConsentChoice: (choice: 'accepted' | 'declined') => void;
  resetConsentPrompt: () => void;
  pageMeta: ResolvedMetaTags;
  setPageMeta: (meta: PageMetaConfig | null) => void;
  appliedCoupon: AppliedCoupon | null;
  applyCouponCode: (
    code: string,
    courseId?: string
  ) => Promise<{ ok: true; coupon: AppliedCoupon } | { ok: false; error: string }>;
  clearAppliedCoupon: () => void;
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUrl, setCurrentUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
  );
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return localStorage.getItem('nf-theme') === 'light' ? 'light' : 'dark';
  });
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(false);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [featuredCourses, setFeaturedCourses] = useState<CourseItem[]>([]);
  const [featuredArticles, setFeaturedArticles] = useState<ArticleItem[]>([]);
  const [workItems, setWorkItems] = useState<WorkShowcaseItem[]>([]);
  const [testimonials, setTestimonials] = useState<TestimonialItem[]>([]);
  const [seoPages, setSeoPages] = useState<SEOPageItem[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [consent, setConsent] = useState<ConsentState>(() => {
    if (typeof window === 'undefined') return 'unset';
    const saved = localStorage.getItem('nf-analytics-consent');
    if (saved === 'accepted' || saved === 'declined') return saved;
    return 'unset';
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [pageMetaOverride, setPageMetaOverride] = useState<{
    path: string;
    config: PageMetaConfig;
  } | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = sessionStorage.getItem('nf-applied-coupon');
      return saved ? (JSON.parse(saved) as AppliedCoupon) : null;
    } catch {
      return null;
    }
  });

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('nf-theme', next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const navigate = useCallback((to: string) => {
    if (typeof window === 'undefined') return;
    if (to === window.location.pathname + window.location.search) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.history.pushState({}, '', to);
    setCurrentUrl(to);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    captureAttribution();
    const onPopState = () => {
      setCurrentUrl(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const setAuthenticatedSession = useCallback(
    (nextUser: AuthUser | null, sessionToken?: string) => {
      if (sessionToken) {
        setStoredSessionToken(sessionToken);
      }
      if (!nextUser) {
        clearStoredSessionToken();
      }
      setUser(nextUser);
      setAuthLoading(false);
    },
    []
  );

  const refreshAuth = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const res = await apiFetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json();
      const nextUser = (data.user as AuthUser | null) || null;
      if (res.ok && !nextUser) {
        clearStoredSessionToken();
      }
      setUser(nextUser);
      return nextUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setAuthLoading(false);
    }
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/public/bootstrap');
      const data = await res.json();
      setDbConnected(Boolean(data.dbConnected));
      setSettings(data.settings || null);
      setServices(data.services || []);
      setProducts(data.products || []);
      setFeaturedCourses(data.featuredCourses || []);
      setFeaturedArticles(data.featuredArticles || []);
      setWorkItems(data.workItems || []);
      setTestimonials(data.testimonials || []);
      setSeoPages(data.seoPages || []);
    } catch {
      // handled cleanly by empty/default states
    } finally {
      setBootstrapLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
    refreshBootstrap();
  }, [refreshAuth, refreshBootstrap]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // Clear local session regardless of transient network failure
    }
    clearStoredSessionToken();
    setUser(null);
    showToast('Signed out successfully.', 'info');
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/portal-admin')) {
      navigate('/portal-admin');
    } else {
      navigate('/');
    }
  }, [navigate, showToast]);

  const setConsentChoice = useCallback((choice: 'accepted' | 'declined') => {
    localStorage.setItem('nf-analytics-consent', choice);
    setConsent(choice);
  }, []);

  const resetConsentPrompt = useCallback(() => {
    localStorage.removeItem('nf-analytics-consent');
    setConsent('unset');
  }, []);

  const clearAppliedCoupon = useCallback(() => {
    try {
      sessionStorage.removeItem('nf-applied-coupon');
    } catch {
      // ignore storage errors
    }
    setAppliedCoupon(null);
  }, []);

  const applyCouponCode = useCallback(
    async (
      code: string,
      courseId?: string
    ): Promise<{ ok: true; coupon: AppliedCoupon } | { ok: false; error: string }> => {
      const trimmed = String(code || '').trim().toUpperCase();
      if (!trimmed) {
        return { ok: false, error: 'Please enter a coupon code.' };
      }
      try {
        const res = await fetch('/api/public/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: trimmed, ...(courseId ? { courseId } : {}) }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.coupon) {
          return { ok: false, error: data.error || 'Invalid coupon code.' };
        }
        const coupon = data.coupon as AppliedCoupon;
        setAppliedCoupon(coupon);
        try {
          sessionStorage.setItem('nf-applied-coupon', JSON.stringify(coupon));
        } catch {
          // ignore storage errors
        }
        return { ok: true, coupon };
      } catch {
        return { ok: false, error: 'Network error validating coupon code.' };
      }
    },
    []
  );

  const [pathnameOnly, searchStr = ''] = currentUrl.split('?');
  const searchParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const normalizedPath = pathnameOnly || '/';

  const setPageMeta = useCallback(
    (meta: PageMetaConfig | null) => {
      if (!meta) {
        setPageMetaOverride((prev) =>
          prev && prev.path === normalizedPath ? null : prev
        );
        return;
      }
      setPageMetaOverride({ path: normalizedPath, config: meta });
    },
    [normalizedPath]
  );

  const pageMeta = useMemo(
    () =>
      resolveRouteMeta({
        pathname: normalizedPath,
        settings,
        seoPages,
        services,
        products,
        featuredCourses,
        featuredArticles,
        override:
          pageMetaOverride?.path === normalizedPath ? pageMetaOverride.config : null,
      }),
    [
      normalizedPath,
      settings,
      seoPages,
      services,
      products,
      featuredCourses,
      featuredArticles,
      pageMetaOverride,
    ]
  );

  // Dynamic Meta-Tags Manager: synchronize <title>, meta tags, canonicals, OG/Twitter cards & JSON-LD
  useEffect(() => {
    applyDocumentHeadMeta(pageMeta, settings?.gscVerificationTag);
  }, [pageMeta, settings?.gscVerificationTag]);

  // Initialize GA4 & track page views ONLY if user accepted analytics consent
  useEffect(() => {
    if (consent === 'accepted' && settings?.gaMeasurementId) {
      initGoogleAnalytics(settings.gaMeasurementId, true);
    }
    if (consent === 'accepted' && !normalizedPath.startsWith('/portal-admin')) {
      trackEvent('page_view', { path: normalizedPath, consentAccepted: true });
    }
  }, [consent, normalizedPath, settings?.gaMeasurementId]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      currentPath: normalizedPath,
      searchParams,
      navigate,
      theme,
      toggleTheme,
      user,
      authLoading,
      refreshAuth,
      setAuthenticatedSession,
      logout,
      dbConnected,
      settings,
      services,
      products,
      featuredCourses,
      featuredArticles,
      workItems,
      testimonials,
      seoPages,
      bootstrapLoading,
      refreshBootstrap,
      consent,
      setConsentChoice,
      resetConsentPrompt,
      pageMeta,
      setPageMeta,
      appliedCoupon,
      applyCouponCode,
      clearAppliedCoupon,
      showToast,
    }),
    [
      normalizedPath,
      searchParams,
      navigate,
      theme,
      toggleTheme,
      user,
      authLoading,
      refreshAuth,
      setAuthenticatedSession,
      logout,
      dbConnected,
      settings,
      services,
      products,
      featuredCourses,
      featuredArticles,
      workItems,
      testimonials,
      seoPages,
      bootstrapLoading,
      refreshBootstrap,
      consent,
      setConsentChoice,
      resetConsentPrompt,
      pageMeta,
      setPageMeta,
      appliedCoupon,
      applyCouponCode,
      clearAppliedCoupon,
      showToast,
    ]
  );

  return (
    <AppContext.Provider value={contextValue}>
      {children}

      {/* Accessible Global Toast Stack */}
      <div
        aria-live="polite"
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 sm:right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-2 sm:px-0"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg px-4 py-3 text-sm font-medium shadow-lg border transition-all ${
              toast.type === 'error'
                ? 'bg-[#1F1224] text-[#FFD6DE] border-[#DC2626]/40'
                : toast.type === 'success'
                  ? 'bg-[#081D2B] text-[#D2F9FF] border-[#00D4FF]/40'
                  : 'bg-[#080D2B] text-[#F7F8FF] border-[#1A2550]'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
