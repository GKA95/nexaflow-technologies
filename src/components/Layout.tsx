import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Download,
  Menu,
  Moon,
  Search,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { AppLink } from './AppLink';
import { CompactHeaderSearchPanel, DesktopHeaderSearch } from './GlobalHeaderSearch';
import { EASE_OUT_EXPO } from './MotionPrimitives';

export function Layout({ children }: { children: React.ReactNode }) {
  const {
    currentPath,
    theme,
    toggleTheme,
    user,
    logout,
    settings,
    consent,
    setConsentChoice,
    resetConsentPrompt,
  } = useApp();

  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compactSearchOpen, setCompactSearchOpen] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const navItems = [
    { label: 'Solutions', href: '/solutions' },
    { label: 'Products', href: '/products' },
    { label: 'Courses', href: '/learn' },
    { label: 'Insights', href: '/insights' },
    { label: 'About', href: '/about' },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu and search overlay on route change
  useEffect(() => {
    setMobileOpen(false);
    setCompactSearchOpen(false);
  }, [currentPath]);

  // Global Cmd/Ctrl + K shortcut for < xl compact header search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (!window.matchMedia('(min-width: 1280px)').matches) {
          e.preventDefault();
          setMobileOpen(false);
          setCompactSearchOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Prevent background scrolling & close on Escape while mobile drawer or compact search is open
  useEffect(() => {
    if (!mobileOpen && !compactSearchOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setCompactSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, compactSearchOpen]);

  const closeDrawers = () => {
    setMobileOpen(false);
    setCompactSearchOpen(false);
  };

  const isRouteActive = (href: string) =>
    currentPath === href || currentPath.startsWith(`${href}/`);

  const isAdminUser = user?.role === 'admin' || user?.role === 'super_admin';
  const showLearnerPortal = Boolean(user && !isAdminUser);

  return (
    <div className="min-h-screen flex flex-col bg-[#F6F8FC] text-[#070B24] dark:bg-[#03051B] dark:text-[#F7F8FF]">
      {/* Primary Top Bar grounded in #03051B so the approved NexaFlow logo artwork blends seamlessly */}
      <header
        className={`sticky top-0 z-40 border-b transition-shadow duration-200 text-[#F7F8FF] ${
          scrolled
            ? 'bg-[#03051B]/95 backdrop-blur-md border-[#1A2550] shadow-lg shadow-black/25'
            : 'bg-[#03051B]/95 backdrop-blur-md border-[#1A2550]'
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-3 lg:gap-4 xl:gap-5">
          {/* Zone 1: Exact Supplied NexaFlow Brand Mark (horizontal on desktop/tablet, compact N mark on small mobile) */}
          <AppLink
            to="/"
            onClick={closeDrawers}
            className="flex items-center gap-2 shrink-0 min-h-[44px] focus-visible:outline-2 focus-visible:outline-[#00D4FF] rounded-md"
            aria-label="NexaFlow Technologies Home"
          >
            <picture className="hidden sm:block shrink-0">
              <source
                srcSet="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.webp"
                type="image/webp"
              />
              <img
                src="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png"
                alt="NexaFlow Technologies — Innovate • Automate • Transform"
                width={144}
                height={49}
                decoding="async"
                className="h-10 lg:h-11 w-auto object-contain"
              />
            </picture>
            <span className="flex sm:hidden items-center gap-2">
              <picture className="shrink-0">
                <source
                  srcSet="/assets/aistudio/nexaflow_icon_512_4fc8acbf.webp"
                  type="image/webp"
                />
                <img
                  src="/assets/aistudio/nexaflow_icon_512_4fc8acbf.png"
                  alt="NexaFlow Technologies"
                  width={32}
                  height={32}
                  decoding="async"
                  className="h-8 w-8 rounded-md object-contain"
                />
              </picture>
              <span className="font-display font-bold text-base tracking-tight text-[#F7F8FF] whitespace-nowrap">
                NexaFlow
              </span>
            </span>
          </AppLink>

          {/* Zone 2: 5 concise single-line text links with smooth shared-layout active indicator */}
          <nav
            aria-label="Primary Navigation"
            className="hidden lg:flex items-center gap-4 2xl:gap-6 text-sm font-medium text-[#AEB8D4]"
          >
            {navItems.map((item) => {
              const active = isRouteActive(item.href);
              return (
                <AppLink
                  key={item.href}
                  to={item.href}
                  onClick={closeDrawers}
                  aria-current={active ? 'page' : undefined}
                  className={`relative whitespace-nowrap shrink-0 py-1.5 transition-colors ${
                    active ? 'text-[#F7F8FF]' : 'hover:text-[#F7F8FF]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <motion.span
                      layoutId="nf-nav-active-bar"
                      transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                      className="absolute left-0 right-0 -bottom-0.5 h-0.5 rounded-full bg-[#00D4FF]"
                    />
                  )}
                </AppLink>
              );
            })}
          </nav>

          {/* Desktop Global Search Input (1280px+) */}
          <DesktopHeaderSearch />

          {/* Zone 3: Search Toggle (<1280px), Theme, Learner Account, Primary Consultation CTA & Optional PWA Install */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setCompactSearchOpen((prev) => !prev);
              }}
              aria-label={compactSearchOpen ? 'Close search' : 'Search products, solutions, and courses'}
              aria-expanded={compactSearchOpen}
              aria-controls="header-compact-search-panel"
              className={`xl:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border transition-colors ${
                compactSearchOpen
                  ? 'border-[#00D4FF] bg-[#10183A] text-[#00D4FF]'
                  : 'border-[#1A2550] text-[#AEB8D4] hover:text-[#F7F8FF] hover:border-[#176BFF]'
              }`}
            >
              {compactSearchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
            </button>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={install}
                className="hidden 2xl:inline-flex items-center gap-1.5 rounded-lg border border-[#1A2550] px-3 min-h-[40px] text-xs font-medium text-[#AEB8D4] hover:text-[#F7F8FF] hover:border-[#00D4FF]/50 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => setShowIOSModal(true)}
                className="hidden 2xl:inline-flex items-center gap-1.5 rounded-lg border border-[#1A2550] px-3 min-h-[40px] text-xs font-medium text-[#AEB8D4] hover:text-[#F7F8FF] transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Install App
              </button>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#1A2550] text-[#AEB8D4] hover:text-[#F7F8FF] hover:border-[#176BFF] transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {showLearnerPortal ? (
              <AppLink
                to="/learner"
                onClick={closeDrawers}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-[#00D4FF]/40 bg-[#080D2B] px-3.5 min-h-[40px] text-xs font-semibold text-[#F7F8FF] hover:bg-[#10183A] transition-colors whitespace-nowrap shrink-0"
              >
                <User className="w-3.5 h-3.5 text-[#00D4FF]" />
                My Portal
              </AppLink>
            ) : (
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <AppLink
                  to="/auth/login"
                  onClick={closeDrawers}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#1A2550] px-3 min-h-[40px] text-xs font-medium text-[#F7F8FF] hover:bg-[#10183A] transition-colors whitespace-nowrap shrink-0"
                >
                  <User className="w-3.5 h-3.5 text-[#00D4FF]" />
                  Sign In
                </AppLink>
                <AppLink
                  to="/auth/register"
                  onClick={closeDrawers}
                  className="inline-flex items-center rounded-lg border border-[#00D4FF]/40 px-3 min-h-[40px] text-xs font-semibold text-[#00D4FF] hover:bg-[#10183A] transition-colors whitespace-nowrap shrink-0"
                >
                  Register
                </AppLink>
              </div>
            )}

            <AppLink
              to="/contact?type=consultation"
              onClick={closeDrawers}
              className="hidden md:inline-flex items-center rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-3.5 xl:px-4 min-h-[40px] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
            >
              Request Consultation
            </AppLink>

            <button
              type="button"
              onClick={() => {
                setCompactSearchOpen(false);
                setMobileOpen((o) => !o);
              }}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
              aria-controls="public-mobile-drawer"
              className="lg:hidden min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#1A2550] text-[#F7F8FF] hover:border-[#00D4FF]/60 transition-colors"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Compact Header Search Panel (< 1280px viewports) */}
        <CompactHeaderSearchPanel
          open={compactSearchOpen}
          onClose={() => setCompactSearchOpen(false)}
        />

        {/* Mobile Drawer & Backdrop with AnimatePresence */}
        <AnimatePresence>
          {mobileOpen && (
            <>
              <motion.div
                key="nf-mobile-backdrop"
                aria-hidden="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setMobileOpen(false)}
                className="lg:hidden fixed inset-x-0 top-16 bottom-0 z-30 bg-black/60 backdrop-blur-[2px]"
              />

              <motion.nav
                key="nf-mobile-drawer"
                id="public-mobile-drawer"
                aria-label="Mobile Navigation"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.24, ease: EASE_OUT_EXPO }}
                className="lg:hidden relative z-40 border-t border-[#1A2550] bg-[#080D2B] px-4 py-4 space-y-1.5 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain shadow-2xl"
              >
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                setCompactSearchOpen(true);
              }}
              className="flex items-center gap-2.5 w-full text-left px-3.5 min-h-[44px] mb-2 rounded-lg bg-[#03051B] border border-[#1A2550] hover:border-[#00D4FF]/50 text-sm text-[#8C98BD] hover:text-[#F7F8FF] transition-colors"
            >
              <Search className="w-4 h-4 text-[#00D4FF] shrink-0" aria-hidden="true" />
              <span>Search products, solutions, courses...</span>
            </button>

            {navItems.map((item) => {
              const active = isRouteActive(item.href);
              return (
                <AppLink
                  key={item.href}
                  to={item.href}
                  onClick={closeDrawers}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center justify-between w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#176BFF]/15 text-[#00D4FF] border border-[#00D4FF]/30 font-semibold'
                      : 'text-[#F7F8FF] hover:bg-[#10183A]'
                  }`}
                >
                  <span>{item.label}</span>
                  {active && (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#00D4FF]" aria-hidden="true" />
                  )}
                </AppLink>
              );
            })}
            <AppLink
              to="/contact"
              onClick={closeDrawers}
              aria-current={isRouteActive('/contact') ? 'page' : undefined}
              className={`flex items-center justify-between w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                isRouteActive('/contact')
                  ? 'bg-[#176BFF]/15 text-[#00D4FF] border border-[#00D4FF]/30 font-semibold'
                  : 'text-[#F7F8FF] hover:bg-[#10183A]'
              }`}
            >
              <span>Contact</span>
              {isRouteActive('/contact') && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#00D4FF]" aria-hidden="true" />
              )}
            </AppLink>

            {!isInstalled && isInstallable && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  void install();
                }}
                className="flex items-center gap-2 w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium text-[#AEB8D4] hover:text-[#F7F8FF] hover:bg-[#10183A]"
              >
                <Download className="w-4 h-4 text-[#00D4FF]" />
                Install NexaFlow App
              </button>
            )}
            {!isInstalled && !isInstallable && isIOS && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setShowIOSModal(true);
                }}
                className="flex items-center gap-2 w-full text-left px-3.5 min-h-[44px] rounded-lg text-sm font-medium text-[#AEB8D4] hover:text-[#F7F8FF] hover:bg-[#10183A]"
              >
                <Download className="w-4 h-4 text-[#00D4FF]" />
                Install App on iOS
              </button>
            )}

            <div className="pt-3 mt-2 border-t border-[#1A2550] flex flex-col gap-2.5">
              {showLearnerPortal ? (
                <>
                  <AppLink
                    to="/learner"
                    onClick={closeDrawers}
                    className="w-full min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[#00D4FF]/40 px-4 py-2.5 text-sm font-semibold text-[#F7F8FF] text-center"
                  >
                    My Portal
                  </AppLink>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileOpen(false);
                      void logout();
                    }}
                    className="w-full min-h-[44px] rounded-lg border border-[#1A2550] px-4 py-2 text-xs font-medium text-[#AEB8D4] text-center"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <AppLink
                    to="/auth/login"
                    onClick={closeDrawers}
                    className="w-full min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[#1A2550] px-3 py-2.5 text-sm font-medium text-[#F7F8FF] text-center"
                  >
                    Sign In
                  </AppLink>
                  <AppLink
                    to="/auth/register"
                    onClick={closeDrawers}
                    className="w-full min-h-[44px] inline-flex items-center justify-center rounded-lg border border-[#00D4FF]/40 px-3 py-2.5 text-sm font-semibold text-[#00D4FF] text-center"
                  >
                    Register
                  </AppLink>
                </div>
              )}
              <AppLink
                to="/contact?type=consultation"
                onClick={closeDrawers}
                className="w-full min-h-[44px] inline-flex items-center justify-center rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2.5 text-sm font-semibold text-white text-center transition-colors"
              >
                Request Consultation
              </AppLink>
            </div>
              </motion.nav>
            </>
          )}
        </AnimatePresence>
      </header>

      <main className="flex-1">{children}</main>

      {/* Quiet Architectural Brand Footer — Zero Admin Links */}
      <footer className="bg-[#03051B] text-[#AEB8D4] border-t border-[#1A2550]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 sm:gap-10">
            <div className="sm:col-span-2 lg:col-span-1">
              <picture className="inline-block">
                <source
                  srcSet="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.webp"
                  type="image/webp"
                />
                <img
                  src="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png"
                  alt="NexaFlow Technologies"
                  width={144}
                  height={49}
                  loading="lazy"
                  decoding="async"
                  className="h-12 w-auto object-contain"
                />
              </picture>
              <p className="mt-4 text-sm text-[#AEB8D4] leading-relaxed">
                {settings?.descriptor || 'AI, Data & Digital Solutions'}
              </p>
              {settings?.generalLocation && (
                <p className="mt-2 text-xs text-[#AEB8D4]/80">{settings.generalLocation}</p>
              )}
              {settings?.businessHours && (
                <p className="mt-1 text-xs text-[#AEB8D4]/80">{settings.businessHours}</p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#F7F8FF] mb-3">Platform</h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <AppLink
                    to="/solutions"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Solutions &amp; Services
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/products"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Products
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/learn"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Courses
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/insights"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Insights &amp; Resources
                  </AppLink>
                </li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#F7F8FF] mb-3">Company &amp; Contact</h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <AppLink
                    to="/about"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    About NexaFlow
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/contact"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Contact &amp; Enquiries
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/contact?type=consultation"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Request Consultation
                  </AppLink>
                </li>
                {settings?.email && (
                  <li>
                    <a
                      href={`mailto:${settings.email}`}
                      className="inline-flex items-center min-h-[40px] py-1 hover:text-[#00D4FF] transition-colors break-all"
                    >
                      {settings.email}
                    </a>
                  </li>
                )}
                {settings?.phone && (
                  <li>
                    <a
                      href={`tel:${settings.phone}`}
                      className="inline-flex items-center min-h-[40px] py-1 hover:text-[#00D4FF] transition-colors"
                    >
                      {settings.phone}
                    </a>
                  </li>
                )}
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-[#F7F8FF] mb-3">Legal &amp; Governance</h4>
              <ul className="space-y-1 text-sm">
                <li>
                  <AppLink
                    to="/legal/privacy"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Privacy Policy
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/legal/terms"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Terms of Service
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/legal/cookies"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Cookie &amp; Analytics Notice
                  </AppLink>
                </li>
                <li>
                  <AppLink
                    to="/legal/refund"
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Course &amp; Refund Policy
                  </AppLink>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={resetConsentPrompt}
                    className="inline-flex items-center min-h-[40px] py-1 text-left hover:text-[#00D4FF] transition-colors"
                  >
                    Cookie Preferences
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 pt-6 border-t border-[#1A2550] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#AEB8D4]/80 text-center sm:text-left">
            <p>
              &copy; {new Date().getFullYear()} {settings?.businessName || 'NexaFlow Technologies'}.
              All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {settings?.socialLinks?.linkedin && (
                <a
                  href={settings.socialLinks.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-[40px] px-1 hover:text-[#F7F8FF]"
                >
                  LinkedIn
                </a>
              )}
              {settings?.socialLinks?.youtube && (
                <a
                  href={settings.socialLinks.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-[40px] px-1 hover:text-[#F7F8FF]"
                >
                  YouTube
                </a>
              )}
              {settings?.socialLinks?.instagram && (
                <a
                  href={settings.socialLinks.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-[40px] px-1 hover:text-[#F7F8FF]"
                >
                  Instagram
                </a>
              )}
              {settings?.socialLinks?.facebook && (
                <a
                  href={settings.socialLinks.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center min-h-[40px] px-1 hover:text-[#F7F8FF]"
                >
                  Facebook
                </a>
              )}
            </div>
          </div>
        </div>
      </footer>

      {/* Consent-First Cookie & Analytics Notice */}
      <AnimatePresence>
        {consent === 'unset' && !currentPath.startsWith('/portal-admin') && (
          <motion.div
            key="nf-cookie-consent"
            role="region"
            aria-label="Analytics Cookie Consent"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-40 rounded-xl bg-[#080D2B] border border-[#1A2550] p-4 shadow-2xl text-[#F7F8FF]"
          >
            <p className="text-xs text-[#AEB8D4] leading-relaxed">
              NexaFlow uses essential session cookies for secure sign-in. Optional analytics cookies
              help us measure page and course interest and only load if you accept.{' '}
              <AppLink
                to="/legal/cookies"
                className="text-[#00D4FF] underline"
              >
                Read Cookie Notice
              </AppLink>
              .
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConsentChoice('accepted')}
                className="min-h-[44px] px-4 py-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] text-xs font-semibold text-white transition-colors"
              >
                Accept Analytics
              </button>
              <button
                type="button"
                onClick={() => setConsentChoice('declined')}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[#1A2550] text-xs font-medium text-[#AEB8D4] hover:text-[#F7F8FF] transition-colors"
              >
                Essential Only
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Safari Install Guide */}
      <AnimatePresence>
        {showIOSModal && (
          <motion.div
            key="nf-ios-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.22, ease: EASE_OUT_EXPO }}
              className="w-full max-w-sm rounded-xl bg-[#080D2B] border border-[#1A2550] p-6 text-[#F7F8FF]"
            >
              <h3 className="text-base font-semibold">Install NexaFlow App on iOS</h3>
              <p className="mt-2 text-sm text-[#AEB8D4]">
                1. Tap the <strong>Share</strong> icon in Safari.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="mt-4 w-full min-h-[44px] rounded-lg bg-[#176BFF] py-2 text-sm font-medium text-white"
              >
                Close
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
