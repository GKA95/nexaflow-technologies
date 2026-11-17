import React, { useCallback, useEffect, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { FieldError } from '../../components/FieldError';
import { useApp } from '../../context/AppContext';
import type { LeadItem } from '../../types';
import { apiFetch } from '../../utils/authSession';
import {
  fieldBorderClass,
  type FieldErrors,
  leadActivityWriteSchema,
  leadUpdateSchema,
  validateWithSchema,
} from '../../utils/formValidation';

const LEAD_STATUSES = [
  'New',
  'Contacted',
  'Interested',
  'Qualified',
  'Proposal Sent',
  'Negotiation',
  'Converted',
  'Lost',
] as const;

export function AdminCrmModule() {
  const { showToast } = useApp();
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [metrics, setMetrics] = useState({
    total: 0,
    newCount: 0,
    qualifiedCount: 0,
    convertedCount: 0,
    conversionRate: 0,
    followUpsDue: 0,
    bySource: {} as Record<string, number>,
    byInterest: {} as Record<string, number>,
  });
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [interestFilter, setInterestFilter] = useState('All');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeLead, setActiveLead] = useState<LeadItem | null>(null);
  const [activities, setActivities] = useState<
    Array<{ _id: string; adminName: string; type: string; content: string; createdAt: string }>
  >([]);
  const [noteType, setNoteType] = useState('note');
  const [noteContent, setNoteContent] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editFollowUp, setEditFollowUp] = useState('');
  const [editReason, setEditReason] = useState('');
  const [savingLead, setSavingLead] = useState(false);
  const [savingActivity, setSavingActivity] = useState(false);
  const [leadErrors, setLeadErrors] = useState<FieldErrors>({});
  const [activityErrors, setActivityErrors] = useState<FieldErrors>({});

  const loadLeads = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (statusFilter !== 'All') params.set('status', statusFilter);
    if (interestFilter !== 'All') params.set('interestType', interestFilter);
    const res = await apiFetch(`/api/admin/leads?${params.toString()}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setLeads(data.leads || []);
      if (data.crmMetrics) setMetrics(data.crmMetrics);
    }
  }, [q, statusFilter, interestFilter]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const openLead = async (lead: LeadItem) => {
    setActiveLead(lead);
    setEditStatus(lead.status);
    setEditFollowUp(lead.followUpDate ? lead.followUpDate.slice(0, 10) : '');
    setEditReason(lead.outcomeReason || '');
    setLeadErrors({});
    setActivityErrors({});
    const res = await apiFetch(`/api/admin/leads/${lead._id}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setActivities(data.activities || []);
    }
  };

  const updateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || savingLead) return;
    setLeadErrors({});
    const check = validateWithSchema(leadUpdateSchema, {
      status: editStatus,
      followUpDate: editFollowUp || null,
      outcomeReason: editReason,
    });
    if (!check.ok) {
      setLeadErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }

    setSavingLead(true);
    try {
      const res = await apiFetch(`/api/admin/leads/${activeLead._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setActiveLead(d.lead);
        showToast('Lead updated.', 'success');
        loadLeads();
        openLead(d.lead);
      } else {
        if (d.fieldErrors && typeof d.fieldErrors === 'object') {
          setLeadErrors(d.fieldErrors as FieldErrors);
        }
        showToast(d.error || 'Could not update lead.', 'error');
      }
    } finally {
      setSavingLead(false);
    }
  };

  const addActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || savingActivity) return;
    setActivityErrors({});
    const check = validateWithSchema(leadActivityWriteSchema, {
      type: noteType,
      content: noteContent,
    });
    if (!check.ok) {
      setActivityErrors(check.fieldErrors);
      showToast(check.message, 'error');
      return;
    }

    setSavingActivity(true);
    try {
      const res = await apiFetch(`/api/admin/leads/${activeLead._id}/activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(check.data),
      });
      if (res.ok) {
        setNoteContent('');
        openLead(activeLead);
        showToast('Activity logged.', 'success');
      } else {
        const d = await res.json().catch(() => ({}));
        if (d.fieldErrors && typeof d.fieldErrors === 'object') {
          setActivityErrors(d.fieldErrors as FieldErrors);
        }
        showToast(d.error || 'Could not log activity.', 'error');
      }
    } finally {
      setSavingActivity(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const exportCsvUrl = `/api/admin/leads/export.csv${
    selectedIds.length > 0 ? `?ids=${encodeURIComponent(selectedIds.join(','))}` : ''
  }`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lead CRM &amp; Pipeline</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Track incoming service, product, course, and consultation enquiries with real attribution.
          </p>
        </div>
        <a
          href={exportCsvUrl}
          className="inline-flex items-center gap-2 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-4 py-2 text-xs font-semibold hover:border-[#176BFF]"
        >
          <Download className="w-4 h-4 text-[#00D4FF]" />
          Export {selectedIds.length > 0 ? `Selected (${selectedIds.length})` : 'All'} CSV
        </a>
      </div>

      {/* Real CRM Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Leads', value: metrics.total },
          { label: 'New Leads', value: metrics.newCount },
          { label: 'Qualified', value: metrics.qualifiedCount },
          { label: 'Converted', value: metrics.convertedCount },
          { label: 'Conversion Rate', value: `${metrics.conversionRate}%` },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-4"
          >
            <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{k.label}</p>
            <p className="mt-1 text-xl font-bold font-mono tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-[#4A5578] dark:text-[#AEB8D4] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="Search leads"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, company, interest..."
            className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 sm:flex items-center gap-2.5">
          <select
            aria-label="Filter leads by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
          >
            <option value="All">All Statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter leads by category"
            value={interestFilter}
            onChange={(e) => setInterestFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
          >
            <option value="All">All Categories</option>
            <option value="service">Services</option>
            <option value="product">Products</option>
            <option value="course">Courses</option>
            <option value="consultation">Consultation</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>

      {/* Leads List (Mobile cards + Desktop table) */}
      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
        {leads.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            No enquiries received yet matching your filters.
          </div>
        ) : (
          <>
            {/* Mobile Cards (<md) */}
            <div className="md:hidden divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
              {leads.map((lead) => (
                <div key={lead._id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex items-start gap-2.5 min-w-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(lead._id)}
                        onChange={() => toggleSelect(lead._id)}
                        aria-label={`Select ${lead.fullName}`}
                        className="mt-1 h-4 w-4 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-sm text-[#070B24] dark:text-[#F7F8FF]">
                          {lead.fullName}
                        </span>
                        <span className="block text-xs text-[#4A5578] dark:text-[#AEB8D4] break-all">
                          {lead.email}
                        </span>
                      </span>
                    </label>
                    <span className="shrink-0 text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF]">
                      {lead.status}
                    </span>
                  </div>

                  <div className="text-xs text-[#4A5578] dark:text-[#AEB8D4] flex flex-wrap items-center justify-between gap-2 pl-6">
                    <span>
                      <strong className="text-[#070B24] dark:text-[#F7F8FF]">{lead.interestName}</strong>{' '}
                      (<span className="capitalize">{lead.interestType}</span>)
                    </span>
                    <span className="font-mono tabular-nums">
                      {new Date(lead.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pl-6 pt-1">
                    <span className="text-[11px] text-[#4A5578] dark:text-[#AEB8D4]">
                      Source: {lead.utmSource || lead.source || 'direct'}
                    </span>
                    <button
                      type="button"
                      onClick={() => openLead(lead)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-[#176BFF]/40 text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:bg-[#176BFF]/10"
                    >
                      Manage
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#DCE3F2] dark:border-[#1A2550] text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                    <th className="p-3 w-8" />
                    <th className="p-3">Contact</th>
                    <th className="p-3">Interest</th>
                    <th className="p-3">Source</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Received</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
                  {leads.map((lead) => (
                    <tr key={lead._id} className="hover:bg-[#EEF2FA]/50 dark:hover:bg-[#10183A]/40">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(lead._id)}
                          onChange={() => toggleSelect(lead._id)}
                          aria-label={`Select ${lead.fullName}`}
                        />
                      </td>
                      <td className="p-3">
                        <p className="font-semibold">{lead.fullName}</p>
                        <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">{lead.email}</p>
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{lead.interestName}</p>
                        <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] capitalize">
                          {lead.interestType}
                        </p>
                      </td>
                      <td className="p-3 text-xs">{lead.utmSource || lead.source || 'direct'}</td>
                      <td className="p-3 font-medium text-xs">{lead.status}</td>
                      <td className="p-3 font-mono text-xs tabular-nums">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => openLead(lead)}
                          className="text-xs font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Lead Detail Drawer */}
      {activeLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="w-full max-w-xl bg-white dark:bg-[#080D2B] border-l border-[#DCE3F2] dark:border-[#1A2550] h-full overflow-y-auto p-5 sm:p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-4">
              <div className="min-w-0">
                <h2 className="text-xl font-bold">{activeLead.fullName}</h2>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4] break-all">
                  {activeLead.email} {activeLead.phone ? `· ${activeLead.phone}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveLead(null)}
                aria-label="Close"
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <p>
                <strong>Interest:</strong> {activeLead.interestName} ({activeLead.interestType})
              </p>
              {activeLead.company && (
                <p>
                  <strong>Company:</strong> {activeLead.company}
                </p>
              )}
              {activeLead.budgetRange && (
                <p>
                  <strong>Budget:</strong> {activeLead.budgetRange}
                </p>
              )}
              <p>
                <strong>Preferred Contact:</strong> {activeLead.preferredContact}
              </p>
              <p className="break-words">
                <strong>Attribution:</strong> Source: {activeLead.source} · Landing:{' '}
                {activeLead.landingPage || '/'} {activeLead.utmCampaign ? `· UTM: ${activeLead.utmCampaign}` : ''}
              </p>
              <div className="p-3.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] whitespace-pre-line">
                {activeLead.description}
              </div>
            </div>

            <form
              onSubmit={updateLead}
              noValidate
              className="space-y-3 border-t border-[#DCE3F2] dark:border-[#1A2550] pt-4"
            >
              <h3 className="text-sm font-semibold">Update Pipeline Status</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <select
                    aria-label="Lead pipeline status"
                    aria-invalid={Boolean(leadErrors.status)}
                    value={editStatus}
                    onChange={(e) => {
                      setEditStatus(e.target.value);
                      setLeadErrors((p) => ({ ...p, status: '' }));
                    }}
                    className={fieldBorderClass(
                      'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      leadErrors.status
                    )}
                  >
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <FieldError error={leadErrors.status} />
                </div>
                <div>
                  <input
                    aria-label="Follow-up date"
                    type="date"
                    aria-invalid={Boolean(leadErrors.followUpDate)}
                    value={editFollowUp}
                    onChange={(e) => {
                      setEditFollowUp(e.target.value);
                      setLeadErrors((p) => ({ ...p, followUpDate: '' }));
                    }}
                    className={fieldBorderClass(
                      'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      leadErrors.followUpDate
                    )}
                  />
                  <FieldError error={leadErrors.followUpDate} />
                </div>
              </div>
              <div>
                <input
                  aria-label="Conversion or lost reason"
                  type="text"
                  aria-invalid={Boolean(leadErrors.outcomeReason)}
                  value={editReason}
                  onChange={(e) => {
                    setEditReason(e.target.value);
                    setLeadErrors((p) => ({ ...p, outcomeReason: '' }));
                  }}
                  placeholder="Conversion or lost reason (optional)"
                  className={fieldBorderClass(
                    'w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                    leadErrors.outcomeReason
                  )}
                />
                <FieldError error={leadErrors.outcomeReason} />
              </div>
              <button
                type="submit"
                disabled={savingLead}
                className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] disabled:opacity-60 px-5 py-2 text-xs font-semibold text-white"
              >
                {savingLead ? 'Saving...' : 'Save Status & Follow-Up'}
              </button>
            </form>

            <form
              onSubmit={addActivity}
              noValidate
              className="space-y-3 border-t border-[#DCE3F2] dark:border-[#1A2550] pt-4"
            >
              <h3 className="text-sm font-semibold">Log Note or Contact History</h3>
              <div className="space-y-1.5">
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    aria-label="Activity type"
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value)}
                    className="min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                  >
                    <option value="note">Internal Note</option>
                    <option value="call">Phone Call</option>
                    <option value="email">Email Sent</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="meeting">Meeting</option>
                  </select>
                  <input
                    aria-label="Activity note summary"
                    type="text"
                    aria-invalid={Boolean(activityErrors.content)}
                    value={noteContent}
                    onChange={(e) => {
                      setNoteContent(e.target.value);
                      setActivityErrors((p) => ({ ...p, content: '' }));
                    }}
                    placeholder="Summary of call, email, or note..."
                    className={fieldBorderClass(
                      'flex-1 min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm',
                      activityErrors.content
                    )}
                  />
                  <button
                    type="submit"
                    disabled={savingActivity}
                    className="w-full sm:w-auto min-h-[44px] rounded-lg bg-[#176BFF] disabled:opacity-60 px-5 py-2 text-xs font-semibold text-white"
                  >
                    {savingActivity ? 'Saving...' : 'Log'}
                  </button>
                </div>
                <FieldError error={activityErrors.content} />
              </div>

              <div className="space-y-2 pt-2">
                {activities.map((a) => (
                  <div
                    key={a._id}
                    className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] p-3 text-xs"
                  >
                    <div className="flex flex-wrap justify-between gap-2 text-[#4A5578] dark:text-[#AEB8D4] mb-1">
                      <span className="font-semibold uppercase">{a.type} · {a.adminName}</span>
                      <span>{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{a.content}</p>
                  </div>
                ))}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
