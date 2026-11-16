import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  Globe,
  KeyRound,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Tag,
  Target,
  Users,
  X,
} from 'lucide-react';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../utils/authSession';
import {
  AdminBlogModule,
  AdminProductsModule,
  AdminServicesModule,
  AdminSupportModule,
} from './AdminContentModules';
import { AdminAccessModule } from './AdminAccessModule';
import { AdminCouponsModule } from './AdminCouponsModule';
import { AdminCoursesModule } from './AdminCoursesModule';
import { AdminCrmModule } from './AdminCrmModule';
import { AdminLearnersModule } from './AdminLearnersModule';
import { AdminReviewsModule } from './AdminReviewsModule';
import { AdminSeoSettingsModule } from './AdminSeoSettingsModule';
import { AdminShowcaseModule } from './AdminShowcaseModule';
import {
  AdminAccountSecurityModule,
  AdminOpsModules,
  AdminSeoModule,
  AdminSettingsModule,
} from './AdminSettingsModules';

type AdminTab =
  | 'overview'
  | 'crm'
  | 'courses'
  | 'coupons'
  | 'reviews'
  | 'learners'
  | 'payments'
  | 'products'
  | 'services'
  | 'showcase'
  | 'blog'
  | 'support'
  | 'website'
  | 'business'
  | 'legal'
  | 'seo-settings'
  | 'seo'
  | 'analytics'
  | 'notifications'
  | 'audit'
  | 'account'
  | 'admins';

export function AdminPortalShell() {
  const { user, logout, navigate, searchParams } = useApp();
  const initialTab = (searchParams.get('tab') as AdminTab) || 'overview';
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Overview & Payments data
  const [overview, setOverview] = useState<{
    metrics: Record<string, unknown>;
    recentPayments: Array<Record<string, unknown>>;
    recentLeads: Array<Record<string, unknown>>;
    recentActivity: Array<Record<string, unknown>>;
    integrations: {
      mongodb: boolean;
      paystack: { configured: boolean; mode: string };
      email: { configured: boolean };
      google?: { configured: boolean };
    };
  } | null>(null);

  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);

  const loadOverview = useCallback(async () => {
    const res = await apiFetch('/api/admin/overview', { credentials: 'include' });
    if (res.ok) setOverview(await res.json());
  }, []);

  const loadPayments = useCallback(async () => {
    const res = await apiFetch('/api/admin/payments', { credentials: 'include' });
    if (res.ok) setPayments((await res.json()).payments || []);
  }, []);

  useEffect(() => {
    if (tab === 'overview') loadOverview();
    if (tab === 'payments') loadPayments();
  }, [tab, loadOverview, loadPayments]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [mobileDrawerOpen]);

  const navItems: Array<{ id: AdminTab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
    { id: 'crm', label: 'Lead CRM', icon: <Target className="w-4 h-4 shrink-0" /> },
    { id: 'courses', label: 'Courses & LMS', icon: <BookOpen className="w-4 h-4 shrink-0" /> },
    { id: 'coupons', label: 'Coupons & Discounts', icon: <Tag className="w-4 h-4 shrink-0" /> },
    { id: 'reviews', label: 'Course Reviews', icon: <Star className="w-4 h-4 shrink-0" /> },
    { id: 'learners', label: 'Learners', icon: <Users className="w-4 h-4 shrink-0" /> },
    { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4 shrink-0" /> },
    { id: 'support', label: 'Support Tickets', icon: <MessageSquare className="w-4 h-4 shrink-0" /> },
    { id: 'services', label: 'Services', icon: <Layers className="w-4 h-4 shrink-0" /> },
    { id: 'products', label: 'Products', icon: <Package className="w-4 h-4 shrink-0" /> },
    { id: 'showcase', label: 'Work & Testimonials', icon: <Briefcase className="w-4 h-4 shrink-0" /> },
    { id: 'blog', label: 'Blog CMS', icon: <FileText className="w-4 h-4 shrink-0" /> },
    { id: 'website', label: 'Website Copy', icon: <Globe className="w-4 h-4 shrink-0" /> },
    { id: 'business', label: 'Business Info', icon: <Building2 className="w-4 h-4 shrink-0" /> },
    { id: 'legal', label: 'Legal Policies', icon: <Shield className="w-4 h-4 shrink-0" /> },
    { id: 'seo-settings', label: 'SEO Settings', icon: <SlidersHorizontal className="w-4 h-4 shrink-0" /> },
    { id: 'seo', label: 'SEO & Tracking', icon: <Search className="w-4 h-4 shrink-0" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4 shrink-0" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4 shrink-0" /> },
    { id: 'audit', label: 'Audit Log', icon: <Activity className="w-4 h-4 shrink-0" /> },
    { id: 'account', label: 'My Emails & Password', icon: <KeyRound className="w-4 h-4 shrink-0" /> },
    { id: 'admins', label: 'Admin Access', icon: <Shield className="w-4 h-4 shrink-0" /> },
  ];

  const activeNavLabel = navItems.find((n) => n.id === tab)?.label || 'Overview';

  const selectTab = (nextTab: AdminTab) => {
    setTab(nextTab);
    setMobileDrawerOpen(false);
  };

  const m = overview?.metrics || {};
  const revList = (m.revenueByCurrency as Array<{ _id: string; total: number }>) || [];
  const revenueLabel =
    revList.length > 0
      ? revList.map((r) => `${r._id} ${r.total}`).join(' / ')
      : 'GHS 0';

  return (
    <>
      <SEOHead
        title="Admin Portal | NexaFlow Technologies"
        description="Protected NexaFlow Technologies Administrator Portal."
        noIndex
      />

      <div className="min-h-screen bg-[#F6F8FC] text-[#070B24] dark:bg-[#03051B] dark:text-[#F7F8FF] flex flex-col lg:flex-row">
        {/* Compact Sticky Mobile Top Bar (<lg) */}
        <header className="lg:hidden sticky top-0 z-40 h-16 px-4 bg-[#03051B] text-[#F7F8FF] border-b border-[#1A2550] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/assets/aistudio/nexaflow_icon_512_4fc8acbf.png"
              alt="NexaFlow Technologies"
              className="h-8 w-8 rounded-md object-contain shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-mono uppercase tracking-wider text-[#00D4FF] truncate">
                Admin Portal
              </p>
              <p className="text-sm font-semibold text-[#F7F8FF] truncate">{activeNavLabel}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open admin navigation drawer"
            aria-expanded={mobileDrawerOpen}
            aria-controls="admin-mobile-drawer"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#1A2550] text-[#F7F8FF] hover:border-[#00D4FF]/60"
          >
            <Menu className="w-5 h-5" />
          </button>
        </header>

        {/* Mobile Drawer Navigation (<lg) */}
        {mobileDrawerOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-xs"
              aria-hidden="true"
              onClick={() => setMobileDrawerOpen(false)}
            />
            <aside
              id="admin-mobile-drawer"
              aria-label="Administrator Navigation"
              className="relative z-10 w-72 max-w-[85vw] h-full bg-[#03051B] text-[#F7F8FF] border-r border-[#1A2550] flex flex-col shadow-2xl"
            >
              <div className="p-4 border-b border-[#1A2550] flex items-center justify-between gap-2">
                <img
                  src="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png"
                  alt="NexaFlow Technologies"
                  className="h-8 w-auto object-contain"
                />
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close admin navigation drawer"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#1A2550] text-[#AEB8D4] hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="p-3 flex-1 overflow-y-auto space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => selectTab(item.id)}
                    aria-current={tab === item.id ? 'page' : undefined}
                    className={`w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                      tab === item.id
                        ? 'bg-[#176BFF] text-white'
                        : 'text-[#AEB8D4] hover:bg-[#10183A] hover:text-[#F7F8FF]'
                    }`}
                  >
                    {item.icon}
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </nav>

              <div className="p-4 border-t border-[#1A2550] space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="text-xs">
                  <p className="font-semibold truncate">{user?.name}</p>
                  <p className="text-[#AEB8D4] font-mono text-[11px]">{user?.role}</p>
                </div>
                <div className="flex items-center gap-3 text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileDrawerOpen(false);
                      navigate('/');
                    }}
                    className="min-h-[44px] text-[#00D4FF] hover:underline"
                  >
                    Public Site
                  </button>
                  <button
                    type="button"
                    onClick={logout}
                    className="min-h-[44px] inline-flex items-center gap-1 text-[#AEB8D4] hover:text-red-400"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Desktop Sidebar (>=lg) */}
        <aside className="hidden lg:flex lg:w-64 shrink-0 bg-[#03051B] text-[#F7F8FF] border-r border-[#1A2550] flex-col">
          <div className="p-4 border-b border-[#1A2550] flex items-center justify-between">
            <img
              src="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png"
              alt="NexaFlow Technologies"
              className="h-9 w-auto object-contain"
            />
          </div>

          <nav className="p-3 flex-1 overflow-y-auto space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-current={tab === item.id ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  tab === item.id
                    ? 'bg-[#176BFF] text-white'
                    : 'text-[#AEB8D4] hover:bg-[#10183A] hover:text-[#F7F8FF]'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-4 border-t border-[#1A2550] space-y-2">
            <div className="text-xs">
              <p className="font-semibold truncate">{user?.name}</p>
              <p className="text-[#AEB8D4] font-mono text-[11px]">{user?.role}</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="text-[#00D4FF] hover:underline"
              >
                Public Site
              </button>
              <button
                type="button"
                onClick={logout}
                className="inline-flex items-center gap-1 text-[#AEB8D4] hover:text-red-400"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-10">
          {tab === 'overview' && (
            <div className="space-y-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold">Administrator Overview</h1>
                  <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                    Live operational metrics computed strictly from MongoDB records.
                  </p>
                </div>
                {overview?.integrations && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                    <span>MongoDB: Connected</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Paystack:{' '}
                      {overview.integrations.paystack.configured
                        ? `Configured (${overview.integrations.paystack.mode})`
                        : 'Credentials Needed'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Email:{' '}
                      {overview.integrations.email.configured ? 'Configured' : 'Optional / Unconfigured'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Google Auth:{' '}
                      {overview.integrations.google?.configured ? 'Configured' : 'Credentials Needed'}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {[
                  { label: 'Total Learners', value: Number(m.totalLearners || 0) },
                  { label: 'Published Courses', value: Number(m.publishedCourses || 0) },
                  { label: 'Active Enrolments', value: Number(m.totalEnrolments || 0) },
                  { label: 'Verified Revenue', value: revenueLabel },
                  { label: 'Total Leads', value: Number(m.totalLeads || 0) },
                  { label: 'New Leads', value: Number(m.newLeads || 0) },
                  { label: 'Converted Leads', value: Number(m.convertedLeads || 0) },
                  { label: 'Open Support Tickets', value: Number(m.openTickets || 0) },
                ].map((k) => (
                  <div
                    key={k.label}
                    className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-4 sm:p-5"
                  >
                    <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{k.label}</p>
                    <p className="mt-2 text-lg sm:text-xl font-bold font-mono tabular-nums break-words">
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                  <h2 className="text-base font-bold mb-3">Recent Enquiries</h2>
                  {(overview?.recentLeads || []).length === 0 ? (
                    <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">No enquiries yet.</p>
                  ) : (
                    <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550] text-sm">
                      {overview!.recentLeads.map((l) => (
                        <li key={String(l._id)} className="py-2.5 flex justify-between gap-2">
                          <span className="min-w-0 truncate">
                            <strong>{String(l.fullName)}</strong> — {String(l.interestName)}
                          </span>
                          <span className="text-xs font-mono shrink-0">{String(l.status)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                  <h2 className="text-base font-bold mb-3">Recent Admin Activity</h2>
                  {(overview?.recentActivity || []).length === 0 ? (
                    <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">No activity recorded yet.</p>
                  ) : (
                    <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550] text-xs">
                      {overview!.recentActivity.map((a) => (
                        <li key={String(a._id)} className="py-2.5 flex justify-between gap-2">
                          <span className="min-w-0 truncate">
                            <strong className="font-mono">{String(a.action)}</strong> ·{' '}
                            {String(a.details || a.entityType)}
                          </span>
                          <span className="font-mono text-[#4A5578] dark:text-[#AEB8D4] shrink-0">
                            {new Date(String(a.createdAt)).toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'crm' && <AdminCrmModule />}
          {tab === 'courses' && <AdminCoursesModule />}
          {tab === 'coupons' && <AdminCouponsModule />}
          {tab === 'reviews' && <AdminReviewsModule />}
          {tab === 'products' && <AdminProductsModule />}
          {tab === 'services' && <AdminServicesModule />}
          {tab === 'showcase' && <AdminShowcaseModule />}
          {tab === 'blog' && <AdminBlogModule />}
          {tab === 'support' && <AdminSupportModule />}
          {tab === 'business' && <AdminSettingsModule mode="business" />}
          {tab === 'website' && <AdminSettingsModule mode="website" />}
          {tab === 'legal' && <AdminSettingsModule mode="legal" />}
          {tab === 'seo-settings' && <AdminSeoSettingsModule />}
          {tab === 'seo' && <AdminSeoModule />}
          {tab === 'account' && <AdminAccountSecurityModule />}
          {tab === 'admins' && <AdminAccessModule />}
          {(tab === 'analytics' ||
            tab === 'notifications' ||
            tab === 'audit') && <AdminOpsModules tab={tab} />}

          {tab === 'learners' && <AdminLearnersModule />}

          {tab === 'payments' && (
            <div className="space-y-5">
              <h1 className="text-2xl font-bold">Payments &amp; Enrolment Transactions</h1>
              <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
                {payments.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                    No payment transactions recorded yet.
                  </div>
                ) : (
                  <>
                    {/* Mobile Payment Cards */}
                    <div className="md:hidden divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                      {payments.map((p) => {
                        const learnerObj = p.userId as { name?: string; email?: string } | undefined;
                        const courseObj = p.courseId as { title?: string } | undefined;
                        const couponCode = p.couponCode ? String(p.couponCode) : '';
                        return (
                          <div key={String(p._id)} className="p-4 space-y-1.5 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-semibold text-sm text-[#070B24] dark:text-[#F7F8FF]">
                                {courseObj?.title || 'Course'}
                              </p>
                              <span className="font-mono font-bold tabular-nums shrink-0">
                                {String(p.currency)} {String(p.amount)}
                              </span>
                            </div>
                            <p className="text-[#4A5578] dark:text-[#AEB8D4]">
                              {learnerObj?.email || '-'}
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-[#4A5578] dark:text-[#AEB8D4]">
                              <span className="truncate">{String(p.reference)}</span>
                              <span className="capitalize font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                                {String(p.status)}
                              </span>
                            </div>
                            {couponCode && (
                              <p className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                                Coupon: {couponCode} ({String(p.discountPercent || 0)}% off)
                              </p>
                            )}
                            <p className="font-mono text-[11px] text-[#4A5578] dark:text-[#AEB8D4]">
                              {new Date(String(p.createdAt)).toLocaleString()} · {String(p.mode).toUpperCase()}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#DCE3F2] dark:border-[#1A2550] text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                            <th className="p-3">Date</th>
                            <th className="p-3">Reference</th>
                            <th className="p-3">Learner</th>
                            <th className="p-3">Course</th>
                            <th className="p-3">Coupon</th>
                            <th className="p-3 text-right">Amount</th>
                            <th className="p-3">Mode</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                          {payments.map((p) => {
                            const learnerObj = p.userId as { name?: string; email?: string } | undefined;
                            const courseObj = p.courseId as { title?: string } | undefined;
                            const couponCode = p.couponCode ? String(p.couponCode) : '';
                            return (
                              <tr key={String(p._id)}>
                                <td className="p-3 font-mono text-xs tabular-nums">
                                  {new Date(String(p.createdAt)).toLocaleString()}
                                </td>
                                <td className="p-3 font-mono text-xs">{String(p.reference)}</td>
                                <td className="p-3 text-xs">{learnerObj?.email || '-'}</td>
                                <td className="p-3 text-xs font-medium">{courseObj?.title || '-'}</td>
                                <td className="p-3 font-mono text-xs">
                                  {couponCode ? `${couponCode} (-${String(p.discountPercent || 0)}%)` : '—'}
                                </td>
                                <td className="p-3 text-right font-mono tabular-nums">
                                  {String(p.currency)} {String(p.amount)}
                                </td>
                                <td className="p-3 font-mono text-xs uppercase">{String(p.mode)}</td>
                                <td className="p-3 text-xs capitalize">{String(p.status)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
