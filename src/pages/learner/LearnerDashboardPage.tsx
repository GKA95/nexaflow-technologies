import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  Bell,
  BookOpen,
  CheckCircle2,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Play,
  Plus,
  Send,
  Settings,
} from 'lucide-react';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { SupportTicketItem } from '../../types';
import { apiFetch } from '../../utils/authSession';

type LearnerTab = 'overview' | 'courses' | 'support' | 'messages' | 'payments' | 'settings';

interface DashboardCourse {
  enrolmentId: string;
  activatedAt: string;
  course: { _id: string; title: string; slug: string; shortDescription: string; coverImage?: string };
  totalLessons: number;
  completedCount: number;
  remainingCount: number;
  percent: number;
  lastLessonId: string | null;
}

interface LearnerPayment {
  _id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  mode: string;
  channel?: string;
  createdAt: string;
  courseId?: { title: string; slug: string };
}

interface LearnerNotification {
  _id: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export function LearnerDashboardPage() {
  const { user, authLoading, navigate, logout, searchParams, showToast, refreshAuth } = useApp();
  const uid = useId();

  const initialTab = (searchParams.get('tab') as LearnerTab) || 'overview';
  const [tab, setTab] = useState<LearnerTab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<DashboardCourse[]>([]);
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [payments, setPayments] = useState<LearnerPayment[]>([]);
  const [notifications, setNotifications] = useState<LearnerNotification[]>([]);
  const [stats, setStats] = useState({
    enrolledCourses: 0,
    completedLessons: 0,
    openTickets: 0,
    unreadNotifications: 0,
  });

  // Support ticket state
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketCategory, setTicketCategory] = useState('Course Question');
  const [ticketCourseId, setTicketCourseId] = useState('');
  const [ticketDesc, setTicketDesc] = useState('');
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [ticketMessages, setTicketMessages] = useState<
    Array<{ _id: string; senderRole: string; senderName: string; message: string; createdAt: string }>
  >([]);
  const [replyText, setReplyText] = useState('');

  // Account settings state
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileOrg, setProfileOrg] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, profRes] = await Promise.all([
        apiFetch('/api/learner/dashboard', { credentials: 'include' }),
        apiFetch('/api/auth/profile', { credentials: 'include' }),
      ]);
      if (dashRes.ok) {
        const d = await dashRes.json();
        setCourses(d.courses || []);
        setTickets(d.tickets || []);
        setPayments(d.payments || []);
        setNotifications(d.notifications || []);
        setStats(d.stats || { enrolledCourses: 0, completedLessons: 0, openTickets: 0, unreadNotifications: 0 });
      }
      if (profRes.ok) {
        const p = await profRes.json();
        if (p.profile) {
          setProfileName(p.profile.name || '');
          setProfilePhone(p.profile.phone || '');
          setProfileOrg(p.profile.organization || '');
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth/login?redirect=/learner');
      return;
    }
    if (user) {
      loadDashboard();
    }
  }, [authLoading, user, navigate, loadDashboard]);

  const openTicketThread = async (ticketId: string) => {
    setActiveTicketId(ticketId);
    const res = await apiFetch(`/api/learner/tickets/${ticketId}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setTicketMessages(data.messages || []);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/learner/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        subject: ticketSubject,
        category: ticketCategory,
        courseId: ticketCourseId || undefined,
        description: ticketDesc,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not submit ticket.', 'error');
      return;
    }
    showToast(`Ticket ${data.ticket.referenceNumber} created.`, 'success');
    setShowNewTicket(false);
    setTicketSubject('');
    setTicketDesc('');
    loadDashboard();
  };

  const handleReplyTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicketId || !replyText.trim()) return;
    const res = await apiFetch(`/api/learner/tickets/${activeTicketId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message: replyText }),
    });
    if (res.ok) {
      setReplyText('');
      openTicketThread(activeTicketId);
      loadDashboard();
    } else {
      const d = await res.json();
      showToast(d.error || 'Failed to send reply.', 'error');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: profileName, phone: profilePhone, organization: profileOrg }),
    });
    if (res.ok) {
      showToast('Account profile updated.', 'success');
      refreshAuth();
    } else {
      const d = await res.json();
      showToast(d.error || 'Update failed.', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const d = await res.json();
    if (res.ok) {
      setCurrentPassword('');
      setNewPassword('');
      showToast('Password updated.', 'success');
    } else {
      showToast(d.error || 'Password update failed.', 'error');
    }
  };

  const markNotifRead = async (id: string) => {
    await apiFetch(`/api/learner/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
  };

  const navButtons: Array<{ id: LearnerTab; label: string; shortLabel: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', shortLabel: 'Overview', icon: <LayoutDashboard className="w-4 h-4 shrink-0" /> },
    { id: 'courses', label: 'My Courses', shortLabel: 'Courses', icon: <BookOpen className="w-4 h-4 shrink-0" /> },
    { id: 'support', label: 'My Questions & Complaints', shortLabel: 'Support', icon: <MessageSquare className="w-4 h-4 shrink-0" /> },
    { id: 'messages', label: 'My Messages', shortLabel: 'Messages', icon: <Bell className="w-4 h-4 shrink-0" /> },
    { id: 'payments', label: 'Payment History', shortLabel: 'Payments', icon: <CreditCard className="w-4 h-4 shrink-0" /> },
    { id: 'settings', label: 'Account Settings', shortLabel: 'Settings', icon: <Settings className="w-4 h-4 shrink-0" /> },
  ];

  if (authLoading || !user) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
        Loading learner portal...
      </div>
    );
  }

  const activeTicket = tickets.find((t) => t._id === activeTicketId);

  return (
    <>
      <SEOHead
        title="Learner Dashboard | NexaFlow Learn"
        description="Private learner workspace for NexaFlow Learn courses, progress, payments, and support."
        noIndex
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Sidebar Navigation (Compact scrollable horizontal tab bar on mobile/tablet, sidebar on lg+) */}
          <aside className="lg:w-64 shrink-0">
            <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3 px-2 sm:px-3 pb-2.5 mb-2.5 border-b border-[#DCE3F2] dark:border-[#1A2550]">
                <div className="min-w-0">
                  <p className="text-[11px] text-[#4A5578] dark:text-[#AEB8D4]">Learner Account</p>
                  <p className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF] truncate">
                    {user.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="lg:hidden min-h-[40px] inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] hover:text-red-500 transition-colors shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>

              <nav
                aria-label="Learner Workspace Navigation"
                className="flex lg:flex-col gap-1.5 overflow-x-auto no-scrollbar pb-1 lg:pb-0"
              >
                {navButtons.map((btn) => {
                  const active = tab === btn.id;
                  return (
                    <button
                      key={btn.id}
                      type="button"
                      onClick={() => setTab(btn.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`shrink-0 whitespace-nowrap lg:w-full min-h-[44px] flex items-center gap-2 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[#176BFF] text-white'
                          : 'text-[#4A5578] dark:text-[#AEB8D4] hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] hover:text-[#070B24] dark:hover:text-[#F7F8FF]'
                      }`}
                    >
                      {btn.icon}
                      <span className="lg:hidden">{btn.shortLabel}</span>
                      <span className="hidden lg:inline truncate">{btn.label}</span>
                    </button>
                  );
                })}
              </nav>

              <div className="hidden lg:block pt-2 mt-2 border-t border-[#DCE3F2] dark:border-[#1A2550]">
                <button
                  type="button"
                  onClick={logout}
                  className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-[#4A5578] dark:text-[#AEB8D4] hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </aside>

          {/* Main Workspace */}
          <div className="flex-1 min-w-0 space-y-6">
            {loading ? (
              <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-8 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                Loading your dashboard...
              </div>
            ) : (
              <>
                {tab === 'overview' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h1 className="text-2xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                          Learner Overview
                        </h1>
                        <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                          Your active courses, completed lessons, and support updates.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/learn')}
                        className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
                      >
                        Browse Courses
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                      {[
                        { label: 'Enrolled Courses', value: stats.enrolledCourses },
                        { label: 'Completed Lessons', value: stats.completedLessons },
                        { label: 'Open Support Tickets', value: stats.openTickets },
                        { label: 'Unread Messages', value: stats.unreadNotifications },
                      ].map((kpi) => (
                        <div
                          key={kpi.label}
                          className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-4 sm:p-5"
                        >
                          <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{kpi.label}</p>
                          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#070B24] dark:text-[#F7F8FF]">
                            {kpi.value}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Continue Learning */}
                    <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                      <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                        Continue Learning
                      </h2>
                      {courses.length === 0 ? (
                        <div className="mt-4 py-6 text-center">
                          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                            You are not enrolled in any courses yet.
                          </p>
                          <button
                            type="button"
                            onClick={() => navigate('/learn')}
                            className="mt-3 min-h-[44px] inline-flex items-center text-sm font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                          >
                            Explore the Course Catalogue
                          </button>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          {courses.map((item) => (
                            <div
                              key={item.enrolmentId}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550]"
                            >
                              <div className="min-w-0 flex-1">
                                <h3 className="font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                                  {item.course.title}
                                </h3>
                                <p className="mt-1 text-xs text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
                                  {item.completedCount} of {item.totalLessons} lessons completed ({item.percent}%)
                                </p>
                                <div className="mt-2 h-2 w-full max-w-sm rounded-full bg-[#EEF2FA] dark:bg-[#10183A] overflow-hidden">
                                  <div
                                    className="h-full bg-[#176BFF]"
                                    style={{ width: `${item.percent}%` }}
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => navigate(`/learner/courses/${item.course.slug}`)}
                                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                              >
                                <Play className="w-3.5 h-3.5" />
                                Continue Learning
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {tab === 'courses' && (
                  <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                    <h1 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                      My Courses &amp; Progress
                    </h1>
                    {courses.length === 0 ? (
                      <p className="mt-4 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                        No active course enrolments yet.
                      </p>
                    ) : (
                      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
                        {courses.map((item) => (
                          <div
                            key={item.enrolmentId}
                            className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] p-5 flex flex-col justify-between"
                          >
                            <div>
                              <h2 className="text-lg font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                                {item.course.title}
                              </h2>
                              <p className="mt-1.5 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                                {item.course.shortDescription}
                              </p>
                              <div className="mt-4 text-xs text-[#4A5578] dark:text-[#AEB8D4] tabular-nums">
                                Completed: {item.completedCount} · Remaining: {item.remainingCount} · {item.percent}%
                              </div>
                              <div className="mt-2 h-2 w-full rounded-full bg-[#EEF2FA] dark:bg-[#10183A] overflow-hidden">
                                <div className="h-full bg-[#00D4FF]" style={{ width: `${item.percent}%` }} />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/learner/courses/${item.course.slug}`)}
                              className="mt-5 w-full min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] py-2.5 text-sm font-semibold text-white"
                            >
                              Open Course Classroom
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {tab === 'support' && (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h1 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                          My Questions, Complaints &amp; Support Tickets
                        </h1>
                        <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                          Ask course questions, report technical issues, or submit feedback privately.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowNewTicket((s) => !s)}
                        className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] px-4 py-2 text-xs font-semibold text-white"
                      >
                        <Plus className="w-4 h-4" />
                        New Ticket
                      </button>
                    </div>

                    {showNewTicket && (
                      <form
                        onSubmit={handleCreateTicket}
                        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6 space-y-4"
                      >
                        <h2 className="text-base font-semibold">Submit Support Ticket</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor={`${uid}-tcat`} className="block text-xs font-medium mb-1">
                              Category
                            </label>
                            <select
                              id={`${uid}-tcat`}
                              value={ticketCategory}
                              onChange={(e) => setTicketCategory(e.target.value)}
                              className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                            >
                              <option value="Course Question">Course Question</option>
                              <option value="Topic Clarification">Topic Clarification</option>
                              <option value="Technical Issue">Technical Issue</option>
                              <option value="Complaint">Complaint</option>
                              <option value="Feedback">Feedback</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor={`${uid}-tcourse`} className="block text-xs font-medium mb-1">
                              Related Course (Optional)
                            </label>
                            <select
                              id={`${uid}-tcourse`}
                              value={ticketCourseId}
                              onChange={(e) => setTicketCourseId(e.target.value)}
                              className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                            >
                              <option value="">General / Not course-specific</option>
                              {courses.map((c) => (
                                <option key={c.course._id} value={c.course._id}>
                                  {c.course.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`${uid}-tsubj`} className="block text-xs font-medium mb-1">
                            Subject *
                          </label>
                          <input
                            id={`${uid}-tsubj`}
                            type="text"
                            required
                            value={ticketSubject}
                            onChange={(e) => setTicketSubject(e.target.value)}
                            className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label htmlFor={`${uid}-tdesc`} className="block text-xs font-medium mb-1">
                            Description *
                          </label>
                          <textarea
                            id={`${uid}-tdesc`}
                            rows={4}
                            required
                            value={ticketDesc}
                            onChange={(e) => setTicketDesc(e.target.value)}
                            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                          />
                        </div>
                        <button
                          type="submit"
                          className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] px-5 py-2 text-xs font-semibold text-white"
                        >
                          Submit Ticket
                        </button>
                      </form>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                      <div className="lg:col-span-5 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
                        {tickets.length === 0 ? (
                          <div className="p-6 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                            No tickets submitted yet.
                          </div>
                        ) : (
                          <ul className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                            {tickets.map((t) => (
                              <li key={t._id}>
                                <button
                                  type="button"
                                  onClick={() => openTicketThread(t._id)}
                                  className={`w-full min-h-[44px] text-left p-4 hover:bg-[#EEF2FA] dark:hover:bg-[#10183A] transition-colors ${
                                    activeTicketId === t._id ? 'bg-[#EEF2FA] dark:bg-[#10183A]' : ''
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                                    <span className="font-mono">{t.referenceNumber}</span>
                                    <span>{t.status}</span>
                                  </div>
                                  <p className="mt-1 font-medium text-sm text-[#070B24] dark:text-[#F7F8FF]">
                                    {t.subject}
                                  </p>
                                  <p className="mt-0.5 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                                    {t.category}
                                  </p>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="lg:col-span-7 rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                        {!activeTicket ? (
                          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                            Select a ticket to view the conversation history and reply.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            <div className="border-b border-[#DCE3F2] dark:border-[#1A2550] pb-3">
                              <p className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                                {activeTicket.referenceNumber} · {activeTicket.category} · {activeTicket.status}
                              </p>
                              <h3 className="mt-1 text-lg font-semibold">{activeTicket.subject}</h3>
                            </div>

                            <div className="space-y-3 max-h-80 overflow-y-auto">
                              {ticketMessages.map((m) => (
                                <div
                                  key={m._id}
                                  className={`p-3.5 rounded-lg text-sm ${
                                    m.senderRole === 'admin'
                                      ? 'bg-[#176BFF]/10 border border-[#176BFF]/30'
                                      : 'bg-[#F6F8FC] dark:bg-[#03051B] border border-[#DCE3F2] dark:border-[#1A2550]'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#4A5578] dark:text-[#AEB8D4] mb-1">
                                    <span className="font-semibold">
                                      {m.senderName} ({m.senderRole === 'admin' ? 'NexaFlow Support' : 'You'})
                                    </span>
                                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                                  </div>
                                  <p className="whitespace-pre-line">{m.message}</p>
                                </div>
                              ))}
                            </div>

                            <form onSubmit={handleReplyTicket} className="flex flex-col sm:flex-row gap-2.5 pt-2">
                              <input
                                type="text"
                                aria-label="Reply to support ticket"
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                placeholder="Write a reply..."
                                className="flex-1 min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                              />
                              <button
                                type="submit"
                                className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white shrink-0"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Reply
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {tab === 'messages' && (
                  <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                    <h1 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                      My Messages &amp; Notifications
                    </h1>
                    {notifications.length === 0 ? (
                      <p className="mt-4 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                        No messages or notifications yet.
                      </p>
                    ) : (
                      <ul className="mt-4 divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                        {notifications.map((n) => (
                          <li key={n._id} className="py-4 flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                                {n.title}
                              </p>
                              <p className="mt-1 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                                {n.message}
                              </p>
                              <p className="mt-1 text-xs text-[#4A5578] dark:text-[#AEB8D4] font-mono">
                                {new Date(n.createdAt).toLocaleString()}
                              </p>
                            </div>
                            {!n.read ? (
                              <button
                                type="button"
                                onClick={() => markNotifRead(n._id)}
                                className="min-h-[40px] px-2 text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline shrink-0"
                              >
                                Mark read
                              </button>
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-[#00D4FF] shrink-0 mt-1" />
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {tab === 'payments' && (
                  <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6">
                    <h1 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">
                      Payment History
                    </h1>
                    {payments.length === 0 ? (
                      <p className="mt-4 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                        No payment transactions recorded yet.
                      </p>
                    ) : (
                      <>
                        {/* Mobile stacked card view */}
                        <div className="md:hidden mt-4 space-y-3">
                          {payments.map((p) => (
                            <div
                              key={p._id}
                              className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-4 space-y-1.5 text-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-semibold text-[#070B24] dark:text-[#F7F8FF]">
                                  {p.courseId?.title || 'Course'}
                                </span>
                                <span className="font-mono font-bold tabular-nums shrink-0">
                                  {p.currency} {p.amount}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                                <span className="font-mono">{new Date(p.createdAt).toLocaleDateString()}</span>
                                <span className="capitalize font-medium">{p.status}</span>
                              </div>
                              <p className="font-mono text-[11px] text-[#4A5578] dark:text-[#AEB8D4] break-all">
                                Ref: {p.reference}
                              </p>
                            </div>
                          ))}
                        </div>

                        {/* Desktop table view */}
                        <div className="hidden md:block mt-4 overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-[#DCE3F2] dark:border-[#1A2550] text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                                <th className="py-2.5 pr-4">Date</th>
                                <th className="py-2.5 pr-4">Course</th>
                                <th className="py-2.5 pr-4">Reference</th>
                                <th className="py-2.5 pr-4 text-right">Amount</th>
                                <th className="py-2.5 pl-4">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                              {payments.map((p) => (
                                <tr key={p._id}>
                                  <td className="py-3 pr-4 font-mono text-xs tabular-nums">
                                    {new Date(p.createdAt).toLocaleDateString()}
                                  </td>
                                  <td className="py-3 pr-4 font-medium">
                                    {p.courseId?.title || 'Course'}
                                  </td>
                                  <td className="py-3 pr-4 font-mono text-xs">{p.reference}</td>
                                  <td className="py-3 pr-4 text-right font-mono tabular-nums">
                                    {p.currency} {p.amount}
                                  </td>
                                  <td className="py-3 pl-4 capitalize">{p.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {tab === 'settings' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <form
                      onSubmit={handleSaveProfile}
                      className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6 space-y-4"
                    >
                      <h2 className="text-lg font-bold">Profile Details</h2>
                      <div>
                        <label htmlFor={`${uid}-pname`} className="block text-xs font-medium mb-1">
                          Full Name
                        </label>
                        <input
                          id={`${uid}-pname`}
                          type="text"
                          required
                          autoComplete="name"
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor={`${uid}-pphone`} className="block text-xs font-medium mb-1">
                          Phone
                        </label>
                        <input
                          id={`${uid}-pphone`}
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          value={profilePhone}
                          onChange={(e) => setProfilePhone(e.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor={`${uid}-porg`} className="block text-xs font-medium mb-1">
                          Organisation
                        </label>
                        <input
                          id={`${uid}-porg`}
                          type="text"
                          autoComplete="organization"
                          value={profileOrg}
                          onChange={(e) => setProfileOrg(e.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] px-5 py-2 text-xs font-semibold text-white"
                      >
                        Save Profile
                      </button>
                    </form>

                    <form
                      onSubmit={handleChangePassword}
                      className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-5 sm:p-6 space-y-4"
                    >
                      <h2 className="text-lg font-bold">Change Password</h2>
                      <div>
                        <label htmlFor={`${uid}-curpw`} className="block text-xs font-medium mb-1">
                          Current Password
                        </label>
                        <input
                          id={`${uid}-curpw`}
                          type="password"
                          required
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label htmlFor={`${uid}-newpw`} className="block text-xs font-medium mb-1">
                          New Password
                        </label>
                        <input
                          id={`${uid}-newpw`}
                          type="password"
                          required
                          autoComplete="new-password"
                          minLength={8}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] px-5 py-2 text-xs font-semibold text-white"
                      >
                        Update Password
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
