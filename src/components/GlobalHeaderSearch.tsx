import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Cpu,
  GraduationCap,
  Layers,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { formatMoneyAmount } from '../utils/pricing';

interface SearchSolutionItem {
  slug: string;
  name: string;
  shortDescription: string;
}

interface SearchProductItem {
  slug: string;
  name: string;
  category?: string;
  shortDescription: string;
  pricingStatus?: string;
}

interface SearchCourseItem {
  slug: string;
  title: string;
  shortDescription: string;
  price: number;
  currency: string;
}

interface SearchPayload {
  solutions: SearchSolutionItem[];
  products: SearchProductItem[];
  courses: SearchCourseItem[];
}

interface FlattenedResult {
  key: string;
  type: 'solution' | 'product' | 'course';
  title: string;
  subtitle: string;
  meta: string;
  href: string;
}

function matchesTokens(fields: Array<string | string[] | undefined | null>, tokens: string[]) {
  if (tokens.length === 0) return true;
  const haystack = fields
    .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []))
    .join(' ')
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const tokens = useMemo(
    () =>
      Array.from(
        new Set(
          query
            .trim()
            .split(/\s+/)
            .map((t) => t.trim())
            .filter((t) => t.length >= 2)
        )
      ),
    [query]
  );

  if (tokens.length === 0) return <>{text}</>;

  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, idx) => {
        const isMatch = tokens.some((t) => part.toLowerCase() === t.toLowerCase());
        return isMatch ? (
          <mark
            key={idx}
            className="bg-[#00D4FF]/20 text-[#00D4FF] rounded-sm px-0.5 font-semibold"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        );
      })}
    </>
  );
}

function useGlobalSearchData(query: string, isOpen: boolean) {
  const { services, products, featuredCourses } = useApp();
  const [remoteResults, setRemoteResults] = useState<SearchPayload | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const localResults = useMemo<SearchPayload>(() => {
    const tokens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    const matchedSolutions = services
      .filter((s) =>
        matchesTokens(
          [s.name, s.shortDescription, s.overview, s.problemsAddressed, s.deliverables],
          tokens
        )
      )
      .slice(0, tokens.length === 0 ? 3 : 6)
      .map((s) => ({
        slug: s.slug,
        name: s.name,
        shortDescription: s.shortDescription,
      }));

    const matchedProducts = products
      .filter((p) =>
        matchesTokens(
          [
            p.name,
            p.category,
            p.shortDescription,
            p.fullDescription,
            p.features,
            p.benefits,
            p.pricingStatus,
          ],
          tokens
        )
      )
      .slice(0, tokens.length === 0 ? 3 : 6)
      .map((p) => ({
        slug: p.slug,
        name: p.name,
        category: p.category,
        shortDescription: p.shortDescription,
        pricingStatus: p.pricingStatus,
      }));

    const matchedCourses = featuredCourses
      .filter((c) =>
        matchesTokens(
          [c.title, c.shortDescription, c.fullDescription, c.objectives, c.outcomes],
          tokens
        )
      )
      .slice(0, tokens.length === 0 ? 3 : 6)
      .map((c) => ({
        slug: c.slug,
        title: c.title,
        shortDescription: c.shortDescription,
        price: c.price,
        currency: c.currency,
      }));

    return {
      solutions: matchedSolutions,
      products: matchedProducts,
      courses: matchedCourses,
    };
  }, [query, services, products, featuredCourses]);

  useEffect(() => {
    if (!isOpen) return;

    const trimmed = query.trim();
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setLoadingRemote(true);
        const res = await fetch(`/api/public/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<SearchPayload>;
        setRemoteResults({
          solutions: Array.isArray(data.solutions) ? data.solutions : [],
          products: Array.isArray(data.products) ? data.products : [],
          courses: Array.isArray(data.courses) ? data.courses : [],
        });
      } catch {
        // Ignore abort / network hiccup; instant local results remain active
      } finally {
        setLoadingRemote(false);
      }
    }, trimmed ? 150 : 50);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, isOpen]);

  // Merge remote results over instant local results when available
  const results = useMemo<SearchPayload>(() => {
    if (!remoteResults) return localResults;
    const isEmptyQuery = query.trim().length === 0;
    return {
      solutions: (remoteResults.solutions.length > 0 || !isEmptyQuery
        ? remoteResults.solutions
        : localResults.solutions
      ).slice(0, isEmptyQuery ? 3 : 6),
      products: (remoteResults.products.length > 0 || !isEmptyQuery
        ? remoteResults.products
        : localResults.products
      ).slice(0, isEmptyQuery ? 3 : 6),
      courses: (remoteResults.courses.length > 0 || !isEmptyQuery
        ? remoteResults.courses
        : localResults.courses
      ).slice(0, isEmptyQuery ? 3 : 6),
    };
  }, [remoteResults, localResults, query]);

  const flattened = useMemo<FlattenedResult[]>(() => {
    const items: FlattenedResult[] = [];
    for (const s of results.solutions) {
      items.push({
        key: `solution:${s.slug}`,
        type: 'solution',
        title: s.name,
        subtitle: s.shortDescription,
        meta: 'Solution',
        href: `/solutions/${s.slug}`,
      });
    }
    for (const p of results.products) {
      items.push({
        key: `product:${p.slug}`,
        type: 'product',
        title: p.name,
        subtitle: p.shortDescription,
        meta: [p.category, p.pricingStatus].filter(Boolean).join(' · ') || 'Product',
        href: `/products/${p.slug}`,
      });
    }
    for (const c of results.courses) {
      items.push({
        key: `course:${c.slug}`,
        type: 'course',
        title: c.title,
        subtitle: c.shortDescription,
        meta: c.price > 0 ? `${c.currency} ${formatMoneyAmount(c.price)}` : 'Free Course',
        href: `/learn/${c.slug}`,
      });
    }
    return items;
  }, [results]);

  return { results, flattened, loadingRemote };
}

function SearchResultsContent({
  query,
  results,
  flattened,
  loadingRemote,
  activeIndex,
  setActiveIndex,
  onSelectHref,
  listboxId,
}: {
  query: string;
  results: SearchPayload;
  flattened: FlattenedResult[];
  loadingRemote: boolean;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  onSelectHref: (href: string) => void;
  listboxId: string;
}) {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const indexByKey = useMemo(() => {
    const map = new Map<string, number>();
    flattened.forEach((item, i) => map.set(item.key, i));
    return map;
  }, [flattened]);

  const groups: Array<{
    id: string;
    heading: string;
    icon: React.ReactNode;
    browseHref: string;
    browseLabel: string;
    items: FlattenedResult[];
  }> = [
    {
      id: 'solutions',
      heading: 'Solutions',
      icon: <Layers className="w-3.5 h-3.5 text-[#00D4FF]" aria-hidden="true" />,
      browseHref: '/solutions',
      browseLabel: 'All Solutions',
      items: results.solutions.map((s) => ({
        key: `solution:${s.slug}`,
        type: 'solution',
        title: s.name,
        subtitle: s.shortDescription,
        meta: 'Solution',
        href: `/solutions/${s.slug}`,
      })),
    },
    {
      id: 'products',
      heading: 'Products',
      icon: <Cpu className="w-3.5 h-3.5 text-[#00D4FF]" aria-hidden="true" />,
      browseHref: '/products',
      browseLabel: 'All Products',
      items: results.products.map((p) => ({
        key: `product:${p.slug}`,
        type: 'product',
        title: p.name,
        subtitle: p.shortDescription,
        meta: [p.category, p.pricingStatus].filter(Boolean).join(' · ') || 'Product',
        href: `/products/${p.slug}`,
      })),
    },
    {
      id: 'courses',
      heading: 'Learning Courses',
      icon: <GraduationCap className="w-3.5 h-3.5 text-[#00D4FF]" aria-hidden="true" />,
      browseHref: '/learn',
      browseLabel: 'All Courses',
      items: results.courses.map((c) => ({
        key: `course:${c.slug}`,
        type: 'course',
        title: c.title,
        subtitle: c.shortDescription,
        meta: c.price > 0 ? `${c.currency} ${formatMoneyAmount(c.price)}` : 'Free Course',
        href: `/learn/${c.slug}`,
      })),
    },
  ];

  const visibleGroups = groups.filter((g) => g.items.length > 0);

  return (
    <div id={listboxId} role="listbox" aria-label="Search suggestions" className="divide-y divide-[#1A2550]">
      <div className="px-3.5 py-2 flex items-center justify-between text-[11px] uppercase tracking-wider text-[#8C98BD] bg-[#060A24]">
        <span>
          {hasQuery
            ? `${flattened.length} matching ${flattened.length === 1 ? 'result' : 'results'}`
            : 'Featured Solutions, Products & Courses'}
        </span>
        {loadingRemote && (
          <span className="inline-flex items-center gap-1 text-[#00D4FF]">
            <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
            Searching
          </span>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <p className="text-sm font-medium text-[#F7F8FF]">
            No solutions, products, or courses matched &ldquo;{query.trim()}&rdquo;.
          </p>
          <p className="mt-1 text-xs text-[#AEB8D4]">
            Try another keyword or explore our full catalogues directly:
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => onSelectHref('/solutions')}
              className="min-h-[40px] px-3.5 rounded-lg border border-[#1A2550] hover:border-[#00D4FF]/60 text-xs font-medium text-[#F7F8FF] hover:bg-[#10183A] transition-colors"
            >
              Browse Solutions
            </button>
            <button
              type="button"
              onClick={() => onSelectHref('/products')}
              className="min-h-[40px] px-3.5 rounded-lg border border-[#1A2550] hover:border-[#00D4FF]/60 text-xs font-medium text-[#F7F8FF] hover:bg-[#10183A] transition-colors"
            >
              Browse Products
            </button>
            <button
              type="button"
              onClick={() => onSelectHref('/learn')}
              className="min-h-[40px] px-3.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] text-xs font-semibold text-white transition-colors"
            >
              Browse Courses
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-[min(60dvh,26rem)] overflow-y-auto overscroll-contain divide-y divide-[#1A2550]/80">
          {visibleGroups.map((group) => (
            <div key={group.id} className="py-1.5">
              <div className="px-3.5 py-1.5 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#AEB8D4]">
                  {group.icon}
                  {group.heading}
                </span>
                <button
                  type="button"
                  onClick={() => onSelectHref(group.browseHref)}
                  className="text-[11px] font-medium text-[#00D4FF] hover:underline whitespace-nowrap"
                >
                  {group.browseLabel}
                </button>
              </div>
              <div className="px-1.5 space-y-0.5">
                {group.items.map((item) => {
                  const flatIdx = indexByKey.get(item.key) ?? -1;
                  const isActive = flatIdx === activeIndex;
                  return (
                    <button
                      key={item.key}
                      ref={(el) => {
                        if (flatIdx >= 0) itemRefs.current[flatIdx] = el;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(flatIdx)}
                      onClick={() => onSelectHref(item.href)}
                      className={`w-full min-h-[44px] px-2.5 py-2 rounded-lg text-left flex items-center justify-between gap-3 transition-colors ${
                        isActive
                          ? 'bg-[#176BFF]/20 border border-[#00D4FF]/40 text-[#F7F8FF]'
                          : 'border border-transparent hover:bg-[#10183A] text-[#F7F8FF]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="text-sm font-semibold text-[#F7F8FF] truncate">
                            <HighlightMatch text={item.title} query={query} />
                          </span>
                          <span className="text-[11px] font-mono text-[#00D4FF] shrink-0">
                            {item.meta}
                          </span>
                        </div>
                        {item.subtitle && (
                          <p className="mt-0.5 text-xs text-[#AEB8D4] line-clamp-1">
                            <HighlightMatch text={item.subtitle} query={query} />
                          </p>
                        )}
                      </div>
                      <ArrowRight
                        className={`w-4 h-4 shrink-0 transition-transform ${
                          isActive ? 'text-[#00D4FF] translate-x-0.5' : 'text-[#6F7B9E]'
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3.5 py-2 bg-[#060A24] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#AEB8D4]">
        <span className="hidden sm:inline">
          Use ↑↓ to navigate, Enter to open, Esc to close
        </span>
        <div className="flex items-center gap-3 ml-auto">
          <button
            type="button"
            onClick={() => onSelectHref('/solutions')}
            className="hover:text-[#00D4FF] transition-colors"
          >
            Solutions
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onSelectHref('/products')}
            className="hover:text-[#00D4FF] transition-colors"
          >
            Products
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => onSelectHref('/learn')}
            className="hover:text-[#00D4FF] transition-colors"
          >
            Courses
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Inline desktop search bar shown inside the global header on >= xl (1280px) viewports.
 */
export function DesktopHeaderSearch() {
  const { navigate, currentPath } = useApp();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const inputId = useId();

  const { results, flattened, loadingRemote } = useGlobalSearchData(query, open);

  const handleSelect = useCallback(
    (href: string) => {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
      navigate(href);
    },
    [navigate]
  );

  // Reset active highlight when flattened list changes
  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  // Close popover on route navigation
  useEffect(() => {
    setOpen(false);
    setActiveIndex(-1);
  }, [currentPath]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Global Cmd+K / Ctrl+K focus shortcut on desktop (>=1280px)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (window.matchMedia('(min-width: 1280px)').matches) {
          e.preventDefault();
          setOpen(true);
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (flattened.length > 0) {
        setActiveIndex((prev) => (prev + 1) % flattened.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      if (flattened.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? flattened.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      if (flattened.length > 0) {
        e.preventDefault();
        const target = flattened[activeIndex >= 0 ? activeIndex : 0];
        if (target) handleSelect(target.href);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={containerRef} className="hidden xl:block relative w-52 2xl:w-64 shrink-0">
      <label htmlFor={inputId} className="sr-only">
        Search products, solutions, and learning courses
      </label>
      <div
        className={`flex items-center gap-2 rounded-lg bg-[#080D2B] border px-2.5 h-10 transition-colors ${
          open
            ? 'border-[#00D4FF] ring-1 ring-[#00D4FF]/30'
            : 'border-[#1A2550] hover:border-[#2C3D7A]'
        }`}
      >
        <Search className="w-4 h-4 text-[#8C98BD] shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search courses, products..."
          className="w-full min-w-0 bg-transparent text-xs text-[#F7F8FF] placeholder:text-[#8C98BD] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(true);
              inputRef.current?.focus();
            }}
            aria-label="Clear search query"
            className="p-1 text-[#8C98BD] hover:text-[#F7F8FF] rounded transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden 2xl:inline-block text-[10px] font-mono text-[#6F7B9E] shrink-0 select-none">
            ⌘K
          </kbd>
        )}
      </div>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(30rem,calc(100vw-2rem))] rounded-xl bg-[#080D2B] border border-[#1A2550] shadow-2xl overflow-hidden z-50">
          <SearchResultsContent
            query={query}
            results={results}
            flattened={flattened}
            loadingRemote={loadingRemote}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            onSelectHref={handleSelect}
            listboxId={listboxId}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Expandable header search bar panel shown below <header> on < xl (<1280px) viewports.
 */
export function CompactHeaderSearchPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { navigate } = useApp();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const inputId = useId();

  const { results, flattened, loadingRemote } = useGlobalSearchData(query, open);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 30);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [query]);

  const handleSelect = useCallback(
    (href: string) => {
      onClose();
      setActiveIndex(-1);
      navigate(href);
    },
    [navigate, onClose]
  );

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (flattened.length > 0) {
        setActiveIndex((prev) => (prev + 1) % flattened.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (flattened.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? flattened.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter') {
      if (flattened.length > 0) {
        e.preventDefault();
        const target = flattened[activeIndex >= 0 ? activeIndex : 0];
        if (target) handleSelect(target.href);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className="xl:hidden fixed inset-x-0 top-16 bottom-0 z-30 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        id="header-compact-search-panel"
        role="region"
        aria-label="Global Header Search"
        className="xl:hidden relative z-40 border-t border-[#1A2550] bg-[#080D2B] shadow-2xl"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <label htmlFor={inputId} className="sr-only">
            Search products, solutions, and learning courses
          </label>
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2.5 rounded-lg bg-[#03051B] border border-[#00D4FF]/60 px-3 min-h-[44px]">
              <Search className="w-4 h-4 text-[#00D4FF] shrink-0" aria-hidden="true" />
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search products, solutions, courses..."
                className="w-full min-w-0 bg-transparent text-sm text-[#F7F8FF] placeholder:text-[#8C98BD] focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  aria-label="Clear search query"
                  className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center text-[#8C98BD] hover:text-[#F7F8FF] rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-3 rounded-lg border border-[#1A2550] text-xs font-medium text-[#AEB8D4] hover:text-[#F7F8FF] hover:bg-[#10183A] transition-colors shrink-0"
            >
              Close
            </button>
          </div>

          <div className="mt-2.5 rounded-xl border border-[#1A2550] bg-[#03051B] overflow-hidden">
            <SearchResultsContent
              query={query}
              results={results}
              flattened={flattened}
              loadingRemote={loadingRemote}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onSelectHref={handleSelect}
              listboxId={listboxId}
            />
          </div>
        </div>
      </div>
    </>
  );
}
