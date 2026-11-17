import React, { useCallback, useEffect, useState } from 'react';
import {
  BookMinus,
  BookPlus,
  Search,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { FieldError } from '../../components/FieldError';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../utils/authSession';
import {
  fieldBorderClass,
  learnerEnrolAssignSchema,
  validateWithSchema,
} from '../../utils/formValidation';

interface EnrolmentRecord {
  _id: string;
  courseId?: {
    _id: string;
    title: string;
    slug: string;
  } | null;
  status: 'active' | 'revoked';
  activatedAt?: string;
}

interface LearnerRecord {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  organization?: string;
  active: boolean;
  createdAt?: string;
  completedLessons: number;
  enrolments: EnrolmentRecord[];
}

interface CourseOption {
  _id: string;
  title: string;
  slug: string;
  published: boolean;
  price: number;
  currency: string;
}

export function AdminLearnersModule() {
  const { showToast } = useApp();
  const [learners, setLearners] = useState<LearnerRecord[]>([]);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Enroll Modal State
  const [enrollTarget, setEnrollTarget] = useState<LearnerRecord | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [enrollError, setEnrollError] = useState('');

  // Un-enroll Modal State
  const [unenrollTarget, setUnenrollTarget] = useState<LearnerRecord | null>(null);
  const [unenrollCourseId, setUnenrollCourseId] = useState('');

  // Remove Person Modal State
  const [removeTarget, setRemoveTarget] = useState<LearnerRecord | null>(null);

  const loadLearners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/learners?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setLearners(data.learners || []);
        setCourses(data.courses || []);
      } else {
        showToast('Could not load learner records.', 'error');
      }
    } catch {
      showToast('Network error loading learners.', 'error');
    } finally {
      setLoading(false);
    }
  }, [query, showToast]);

  useEffect(() => {
    loadLearners();
  }, [loadLearners]);

  const handleToggleSuspend = async (learner: LearnerRecord) => {
    setBusyId(learner._id);
    try {
      const res = await apiFetch(`/api/admin/learners/${learner._id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ active: !learner.active }),
      });
      if (res.ok) {
        showToast(
          learner.active
            ? `${learner.name} has been suspended.`
            : `${learner.name} has been activated.`,
          'success'
        );
        await loadLearners();
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Could not update learner status.', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const openEnrollModal = (learner: LearnerRecord) => {
    const enrolledIds = new Set(
      learner.enrolments.map((e) => e.courseId?._id).filter(Boolean) as string[]
    );
    const firstAvailable = courses.find((c) => !enrolledIds.has(c._id));
    setSelectedCourseId(firstAvailable?._id || '');
    setEnrollError('');
    setEnrollTarget(learner);
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollTarget || busyId) return;
    setEnrollError('');
    const check = validateWithSchema(learnerEnrolAssignSchema, { courseId: selectedCourseId });
    if (!check.ok) {
      setEnrollError(check.fieldErrors.courseId || check.message);
      return;
    }

    setBusyId(enrollTarget._id);
    try {
      const res = await apiFetch(`/api/admin/learners/${enrollTarget._id}/enrol`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Enrolled ${enrollTarget.name} in the selected course.`, 'success');
        setEnrollTarget(null);
        setSelectedCourseId('');
        await loadLearners();
      } else {
        setEnrollError(data.error || 'Could not enroll learner.');
        showToast(data.error || 'Could not enroll learner.', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const openUnenrollModal = (learner: LearnerRecord, preselectedCourseId?: string) => {
    const firstCourseId =
      preselectedCourseId || learner.enrolments.find((e) => e.courseId?._id)?.courseId?._id || '';
    setUnenrollCourseId(firstCourseId);
    setUnenrollTarget(learner);
  };

  const handleUnenrollConfirm = async () => {
    if (!unenrollTarget || !unenrollCourseId) return;
    setBusyId(unenrollTarget._id);
    try {
      const res = await apiFetch(
        `/api/admin/learners/${unenrollTarget._id}/enrolments/${unenrollCourseId}`,
        {
          method: 'DELETE',
          credentials: 'include',
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Un-enrolled ${unenrollTarget.name} from the course.`, 'success');
        setUnenrollTarget(null);
        setUnenrollCourseId('');
        await loadLearners();
      } else {
        showToast(data.error || 'Could not un-enroll learner.', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePerson = async () => {
    if (!removeTarget) return;
    setBusyId(removeTarget._id);
    try {
      const res = await apiFetch(`/api/admin/learners/${removeTarget._id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Removed ${removeTarget.name} (${removeTarget.email}).`, 'success');
        setRemoveTarget(null);
        await loadLearners();
      } else {
        showToast(data.error || 'Could not remove learner.', 'error');
      }
    } finally {
      setBusyId(null);
    }
  };

  const visibleLearners = learners.filter((l) => {
    if (statusFilter === 'active') return l.active;
    if (statusFilter === 'suspended') return !l.active;
    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Learner Management</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Suspend accounts, enroll or un-enroll learners in courses, or permanently remove a
            learner record.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-[#4A5578] dark:text-[#AEB8D4] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              aria-label="Search learners by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email..."
              className="w-full sm:w-60 min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-[#176BFF]"
            />
          </div>

          <select
            aria-label="Filter learners by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
            className="w-full sm:w-auto min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm focus:outline-none focus:border-[#176BFF]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Loading learners...
          </div>
        ) : visibleLearners.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            No matching learner accounts found.
          </div>
        ) : (
          <>
            {/* Mobile card list (<md) */}
            <div className="md:hidden divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
              {visibleLearners.map((l) => {
                const isBusy = busyId === l._id;
                const activeEnrolments = l.enrolments.filter((e) => e.courseId?._id);
                return (
                  <div key={l._id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-[#070B24] dark:text-[#F7F8FF]">{l.name}</p>
                        <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] break-all">
                          {l.email}
                        </p>
                        {(l.organization || l.phone) && (
                          <p className="mt-1 text-[11px] text-[#4A5578] dark:text-[#AEB8D4]/80">
                            {[l.organization, l.phone].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold ${
                          l.active
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {l.active ? 'Active' : 'Suspended'}
                      </span>
                    </div>

                    <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] font-mono tabular-nums">
                      Progress: {Number(l.completedLessons || 0)} completed lessons
                    </div>

                    {activeEnrolments.length > 0 ? (
                      <div className="space-y-1.5">
                        {activeEnrolments.map((enr) => (
                          <div
                            key={enr._id}
                            className="flex items-center justify-between gap-2 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                          >
                            <span className="font-medium truncate">{enr.courseId?.title}</span>
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openUnenrollModal(l, enr.courseId?._id)}
                              className="shrink-0 min-h-[32px] px-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
                            >
                              Un-enroll
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                        No active courses
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEnrollModal(l)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#176BFF]/40 bg-[#176BFF]/10 px-3 py-2 text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] disabled:opacity-50"
                      >
                        <BookPlus className="w-3.5 h-3.5" />
                        Enroll
                      </button>

                      {activeEnrolments.length > 0 && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => openUnenrollModal(l)}
                          className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 disabled:opacity-50"
                        >
                          <BookMinus className="w-3.5 h-3.5" />
                          Un-enroll
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleSuspend(l)}
                        className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50 ${
                          l.active
                            ? 'border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4]'
                            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {l.active ? (
                          <>
                            <UserX className="w-3.5 h-3.5" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <UserCheck className="w-3.5 h-3.5" />
                            Activate
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setRemoveTarget(l)}
                        className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#DCE3F2] dark:border-[#1A2550] text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                    <th className="p-3.5">Learner</th>
                    <th className="p-3.5">Enrolled Courses</th>
                    <th className="p-3.5">Progress</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                  {visibleLearners.map((l) => {
                    const isBusy = busyId === l._id;
                    const activeEnrolments = l.enrolments.filter((e) => e.courseId?._id);

                    return (
                      <tr key={l._id} className="align-top">
                        <td className="p-3.5">
                          <p className="font-semibold text-[#070B24] dark:text-[#F7F8FF]">{l.name}</p>
                          <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{l.email}</p>
                          {(l.organization || l.phone) && (
                            <p className="mt-1 text-[11px] text-[#4A5578] dark:text-[#AEB8D4]/80">
                              {[l.organization, l.phone].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </td>

                        <td className="p-3.5 max-w-xs">
                          {activeEnrolments.length === 0 ? (
                            <span className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                              No active courses
                            </span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {activeEnrolments.map((enr) => (
                                <div
                                  key={enr._id}
                                  className="flex items-center justify-between gap-2 rounded-md border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-2.5 py-1.5 text-xs"
                                >
                                  <span className="font-medium truncate">{enr.courseId?.title}</span>
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => openUnenrollModal(l, enr.courseId?._id)}
                                    className="shrink-0 text-[11px] font-medium text-amber-600 dark:text-amber-400 hover:underline disabled:opacity-50"
                                    title="Un-enroll from this course"
                                  >
                                    Un-enroll
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        <td className="p-3.5 font-mono tabular-nums text-xs">
                          {Number(l.completedLessons || 0)} lessons
                        </td>

                        <td className="p-3.5 text-xs">
                          <span
                            className={`inline-block font-semibold ${
                              l.active
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}
                          >
                            {l.active ? 'Active' : 'Suspended'}
                          </span>
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => openEnrollModal(l)}
                              className="inline-flex items-center gap-1 rounded-md border border-[#176BFF]/40 bg-[#176BFF]/10 px-2.5 py-1.5 text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] hover:bg-[#176BFF]/20 disabled:opacity-50"
                            >
                              <BookPlus className="w-3.5 h-3.5" />
                              Enroll
                            </button>

                            {activeEnrolments.length > 0 && (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => openUnenrollModal(l)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                <BookMinus className="w-3.5 h-3.5" />
                                Un-enroll
                              </button>
                            )}

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleToggleSuspend(l)}
                              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium disabled:opacity-50 ${
                                l.active
                                  ? 'border-[#DCE3F2] dark:border-[#1A2550] text-[#4A5578] dark:text-[#AEB8D4] hover:border-amber-500/50 hover:text-amber-600 dark:hover:text-amber-300'
                                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20'
                              }`}
                            >
                              {l.active ? (
                                <>
                                  <UserX className="w-3.5 h-3.5" />
                                  Suspend
                                </>
                              ) : (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Activate
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => setRemoveTarget(l)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Enroll Learner in a Course Modal */}
      {enrollTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Enroll Learner in Course</h2>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] mt-0.5">
                  {enrollTarget.name} ({enrollTarget.email})
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setEnrollTarget(null)}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEnrollSubmit} noValidate className="mt-5 space-y-4">
              {courses.length === 0 ? (
                <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
                  No courses exist yet. Create a course under Courses &amp; LMS first.
                </p>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
                    Select Course *
                  </label>
                  <select
                    required
                    aria-invalid={Boolean(enrollError)}
                    value={selectedCourseId}
                    onChange={(e) => {
                      setSelectedCourseId(e.target.value);
                      if (enrollError) setEnrollError('');
                    }}
                    className={fieldBorderClass(
                      'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2.5 text-sm',
                      enrollError
                    )}
                  >
                    <option value="">-- Choose a course --</option>
                    {courses.map((c) => {
                      const alreadyEnrolled = enrollTarget.enrolments.some(
                        (e) => e.courseId?._id === c._id
                      );
                      return (
                        <option key={c._id} value={c._id} disabled={alreadyEnrolled}>
                          {c.title}
                          {!c.published ? ' (Draft)' : ''}
                          {alreadyEnrolled ? ' — Already Enrolled' : ''}
                        </option>
                      );
                    })}
                  </select>
                  <FieldError error={enrollError} />
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEnrollTarget(null)}
                  className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedCourseId || busyId === enrollTarget._id}
                  className="min-h-[44px] rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
                >
                  {busyId === enrollTarget._id ? 'Enrolling...' : 'Enroll Learner'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Un-enroll Learner Modal */}
      {unenrollTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Un-enroll Learner</h2>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] mt-0.5">
                  {unenrollTarget.name} ({unenrollTarget.email})
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setUnenrollTarget(null)}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5">
                  Course to Revoke Access From
                </label>
                <select
                  value={unenrollCourseId}
                  onChange={(e) => setUnenrollCourseId(e.target.value)}
                  className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2.5 text-sm"
                >
                  {unenrollTarget.enrolments
                    .filter((enr) => enr.courseId?._id)
                    .map((enr) => (
                      <option key={enr._id} value={enr.courseId!._id}>
                        {enr.courseId!.title}
                      </option>
                    ))}
                </select>
              </div>
              <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                The learner will immediately lose access to this course&apos;s classroom and videos.
                You can re-enroll them at any time.
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setUnenrollTarget(null)}
                  className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!unenrollCourseId || busyId === unenrollTarget._id}
                  onClick={handleUnenrollConfirm}
                  className="min-h-[44px] rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
                >
                  {busyId === unenrollTarget._id ? 'Un-enrolling...' : 'Confirm Un-enroll'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Remove Learner Confirmation Modal */}
      {removeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-red-500/40 bg-white dark:bg-[#080D2B] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-red-600 dark:text-red-400">
                  Remove Learner Permanently
                </h2>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] mt-0.5">
                  {removeTarget.name} ({removeTarget.email})
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setRemoveTarget(null)}
                className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-md text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="mt-4 text-sm text-[#4A5578] dark:text-[#AEB8D4] leading-relaxed">
              This will permanently remove <strong>{removeTarget.name}</strong> from MongoDB along
              with their course enrolments, lesson progress, and support tickets. This action cannot
              be undone.
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRemoveTarget(null)}
                className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-4 py-2 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === removeTarget._id}
                onClick={handleRemovePerson}
                className="min-h-[44px] rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white"
              >
                {busyId === removeTarget._id ? 'Removing...' : 'Remove Person'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
