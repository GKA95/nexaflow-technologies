import React, { useCallback, useEffect, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { LeadItem } from '../../types';
import { apiFetch } from '../../utils/authSession';

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
    const res = await apiFetch(`/api/admin/leads/${lead._id}`, { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setActivities(data.activities || []);
    }
  };

  const updateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead) return;
    const res = await apiFetch(`/api/admin/leads/${activeLead._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        status: editStatus,
        followUpDate: editFollowUp || null,
        outcomeReason: editReason,
      }),
    });
    if (res.ok) {
      const d = await res.json();
      setActiveLead(d.lead);
      showToast('Lead updated.', 'success');
      loadLeads();
      openLead(d.lead);
    }
  };

  const addActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLead || !noteContent.trim()) return;
    const res = await apiFetch(`/api/admin/leads/${activeLead._id}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ type: noteType, content: noteContent }),
    });
    if (res.ok) {
      setNoteContent('');
      openLead(activeLead);
      showToast('Activity logged.', 'success');
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-[#4A5578] dark:text-[#AEB8D4] absolute left-3 top-2.5" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, company, interest..."
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
        >
          <option value="All">All Statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={interestFilter}
          onChange={(e) => setInterestFilter(e.target.value)}
          className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] px-3 py-2 text-sm"
        >
          <option value="All">All Categories</option>
          <option value="service">Services</option>
          <option value="product">Products</option>
          <option value="course">Courses</option>
          <option value="consultation">Consultation</option>
          <option value="general">General</option>
        </select>
      </div>

      {/* Leads Table */}
      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-x-auto">
        {leads.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            No enquiries received yet matching your filters.
          </div>
        ) : (
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
        )}
      </div>

      {/* Lead Detail Drawer */}
      {activeLead && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60">
          <div className="w-full max-w-xl bg-white dark:bg-[#080D2B] border-l border-[#DCE3F2] dark:border-[#1A2550] h-full overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 border-b border-[#DCE3F2] dark:border-[#1A2550] pb-4">
              <div>
                <h2 className="text-xl font-bold">{activeLead.fullName}</h2>
                <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                  {activeLead.email} {activeLead.phone ? `· ${activeLead.phone}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setActiveLead(null)} aria-label="Close">
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
              <p>
                <strong>Attribution:</strong> Source: {activeLead.source} · Landing:{' '}
                {activeLead.landingPage || '/'} {activeLead.utmCampaign ? `· UTM: ${activeLead.utmCampaign}` : ''}
              </p>
              <div className="p-3.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] whitespace-pre-line">
                {activeLead.description}
              </div>
            </div>

            <form
              onSubmit={updateLead}
              className="space-y-3 border-t border-[#DCE3F2] dark:border-[#1A2550] pt-4"
            >
              <h3 className="text-sm font-semibold">Update Pipeline Status</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={editFollowUp}
                  onChange={(e) => setEditFollowUp(e.target.value)}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
              </div>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Conversion or lost reason (optional)"
                className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
              >
                Save Status &amp; Follow-Up
              </button>
            </form>

            <form
              onSubmit={addActivity}
              className="space-y-3 border-t border-[#DCE3F2] dark:border-[#1A2550] pt-4"
            >
              <h3 className="text-sm font-semibold">Log Note or Contact History</h3>
              <div className="flex gap-2">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value)}
                  className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                >
                  <option value="note">Internal Note</option>
                  <option value="call">Phone Call</option>
                  <option value="email">Email Sent</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="meeting">Meeting</option>
                </select>
                <input
                  type="text"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Summary of call, email, or note..."
                  className="flex-1 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#176BFF] px-4 py-2 text-xs font-semibold text-white"
                >
                  Log
                </button>
              </div>

              <div className="space-y-2 pt-2">
                {activities.map((a) => (
                  <div
                    key={a._id}
                    className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] p-3 text-xs"
                  >
                    <div className="flex justify-between text-[#4A5578] dark:text-[#AEB8D4] mb-1">
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
