import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  KeyRound,
  Mail,
  Search,
  Shield,
  ShieldOff,
  UserPlus,
} from 'lucide-react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useApp } from '../../context/AppContext';
import { apiFetch } from '../../utils/authSession';

interface AdminAccountItem {
  _id: string;
  name: string;
  email: string;
  secondaryEmails?: string[];
  role: 'admin' | 'super_admin';
  active: boolean;
  authProviders?: string[];
  googleLinked?: boolean;
  hasPassword?: boolean;
  createdAt?: string;
}

export function AdminAccessModule() {
  const { user, showToast } = useApp();
  const [admins, setAdmins] = useState<AdminAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQ, setSearchQ] = useState('');

  // Grant / Add admin state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [secondaryEmailsInput, setSecondaryEmailsInput] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'super_admin'>('admin');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Edit existing admin state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    secondaryEmails: '',
    role: 'admin' as 'admin' | 'super_admin',
    active: true,
    newPassword: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Revoke confirmation modal state
  const [revokeTarget, setRevokeTarget] = useState<AdminAccountItem | null>(null);

  const loadAdmins = useCallback(async () => {
    if (user?.role !== 'super_admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/admins?q=${encodeURIComponent(searchQ)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setAdmins(data.admins || []);
      }
    } finally {
      setLoading(false);
    }
  }, [searchQ, user?.role]);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleGrantAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAdd(true);
    try {
      const secondaryEmails = secondaryEmailsInput
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const res = await apiFetch('/api/admin/admins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name,
          email,
          secondaryEmails,
          password,
          role,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not grant administrative access.', 'error');
        return;
      }

      showToast(
        data.promoted
          ? `Granted ${role} access to existing MongoDB user (${data.admin.email}).`
          : `Added administrator (${data.admin.email}) to MongoDB.`,
        'success'
      );
      setName('');
      setEmail('');
      setSecondaryEmailsInput('');
      setPassword('');
      setRole('admin');
      loadAdmins();
    } finally {
      setSubmittingAdd(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    setSavingEdit(true);
    try {
      const res = await apiFetch(`/api/admin/admins/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          secondaryEmails: editForm.secondaryEmails
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
          role: editForm.role,
          active: editForm.active,
          ...(editForm.newPassword ? { newPassword: editForm.newPassword } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Could not update administrator.', 'error');
        return;
      }
      showToast('Administrator permissions updated in MongoDB.', 'success');
      setEditingId(null);
      loadAdmins();
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const target = revokeTarget;
    setRevokeTarget(null);

    const res = await apiFetch(`/api/admin/admins/${target._id}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mode: 'demote' }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not revoke administrative access.', 'error');
      return;
    }
    showToast(`Administrative access revoked for ${target.email}.`, 'info');
    loadAdmins();
  };

  if (user?.role !== 'super_admin') {
    return (
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-2xl font-bold">Admin Access Management</h1>
        <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
          Only a <strong>Super Administrator</strong> can view, grant, or revoke administrative
          access for other user emails. To update your own login emails or password, use{' '}
          <strong>My Emails &amp; Password</strong>.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Admin Access Management</h1>
          <p className="text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            View, grant, or revoke administrator access for specific user emails in MongoDB.
            Existing learner emails entered below are promoted automatically while keeping their
            account history.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#4A5578] dark:text-[#AEB8D4] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="Filter admin emails..."
            className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] pl-9 pr-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Add / Grant Administrative Access Form */}
      <form
        onSubmit={handleGrantAdmin}
        className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-[#00D4FF]" />
          <h2 className="text-base font-bold">Grant Administrative Access by Email</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">User Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@yourdomain.com"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Full Name (Optional if user already exists)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Administrator name"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Admin Role *</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'admin' | 'super_admin')}
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            >
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <label className="block text-xs font-medium mb-1">
              Additional Login / Google Emails (Optional, comma-separated)
            </label>
            <input
              type="text"
              value={secondaryEmailsInput}
              onChange={(e) => setSecondaryEmailsInput(e.target.value)}
              placeholder="e.g. personal.gmail@gmail.com"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">
              Password (10+ chars, or blank for Google Sign-In)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for Google-only"
              className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
          <p className="text-xs text-[#4A5578] dark:text-[#AEB8D4]">
            Matches existing MongoDB users by primary or secondary email, or creates a new admin
            record.
          </p>
          <button
            type="submit"
            disabled={submittingAdd}
            className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            {submittingAdd ? 'Granting Access...' : 'Grant Admin Access'}
          </button>
        </div>
      </form>

      {/* Authorised Administrators List */}
      <div className="rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-[#DCE3F2] dark:border-[#1A2550] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#00D4FF]" />
            <h2 className="text-base font-bold">
              Authorised Administrators ({admins.length})
            </h2>
          </div>
          <span className="text-xs font-mono text-[#4A5578] dark:text-[#AEB8D4]">
            MongoDB Collection: users
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            Loading administrators from MongoDB...
          </div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-center text-sm text-[#4A5578] dark:text-[#AEB8D4]">
            No matching administrator accounts found.
          </div>
        ) : (
          <div className="divide-y divide-[#DCE3F2] dark:divide-[#1A2550]">
            {admins.map((a) => {
              const isSelf = a._id === user?.id;
              return (
                <div key={a._id} className="p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm">{a.name}</span>
                        <span className="font-mono text-xs text-[#176BFF] dark:text-[#00D4FF]">
                          {a.role}
                        </span>
                        {isSelf && (
                          <span className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                            (You)
                          </span>
                        )}
                        {!a.active && (
                          <span className="text-xs font-medium text-red-500">Suspended</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Mail className="w-3.5 h-3.5" />
                          {a.email}
                        </span>
                        {a.googleLinked && (
                          <span className="inline-flex items-center gap-1 text-emerald-500">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Google Linked
                          </span>
                        )}
                        {a.hasPassword && (
                          <span className="inline-flex items-center gap-1">
                            <KeyRound className="w-3.5 h-3.5" />
                            Password Set
                          </span>
                        )}
                      </div>

                      {a.secondaryEmails && a.secondaryEmails.length > 0 && (
                        <p className="text-[11px] font-mono text-[#4A5578] dark:text-[#AEB8D4]">
                          Additional emails: {a.secondaryEmails.join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          if (editingId === a._id) {
                            setEditingId(null);
                          } else {
                            setEditingId(a._id);
                            setEditForm({
                              name: a.name,
                              email: a.email,
                              secondaryEmails: (a.secondaryEmails || []).join(', '),
                              role: a.role,
                              active: a.active,
                              newPassword: '',
                            });
                          }
                        }}
                        className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] px-3 py-1.5 text-xs font-medium hover:border-[#176BFF]"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {editingId === a._id ? 'Close' : 'Edit'}
                      </button>

                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => setRevokeTarget(a)}
                          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-500 dark:text-red-300"
                        >
                          <ShieldOff className="w-3.5 h-3.5" />
                          Revoke Access
                        </button>
                      )}
                    </div>
                  </div>

                  {editingId === a._id && (
                    <form
                      onSubmit={(e) => handleSaveEdit(e, a._id)}
                      className="pt-4 border-t border-[#DCE3F2] dark:border-[#1A2550] grid grid-cols-1 sm:grid-cols-2 gap-3"
                    >
                      <div>
                        <label className="block text-[11px] font-medium mb-1">Full Name</label>
                        <input
                          required
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium mb-1">Primary Email</label>
                        <input
                          type="email"
                          required
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                          className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium mb-1">
                          Additional Emails (comma-separated)
                        </label>
                        <input
                          value={editForm.secondaryEmails}
                          onChange={(e) =>
                            setEditForm({ ...editForm, secondaryEmails: e.target.value })
                          }
                          className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium mb-1">
                          Reset / Set Password (10+ chars, optional)
                        </label>
                        <input
                          type="password"
                          value={editForm.newPassword}
                          onChange={(e) =>
                            setEditForm({ ...editForm, newPassword: e.target.value })
                          }
                          placeholder="Leave blank to keep existing"
                          className="w-full rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-4 text-xs">
                          <select
                            value={editForm.role}
                            disabled={isSelf}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                role: e.target.value as 'admin' | 'super_admin',
                              })
                            }
                            className="rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-2.5 py-1.5"
                          >
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                          <label className="inline-flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              disabled={isSelf}
                              checked={editForm.active}
                              onChange={(e) =>
                                setEditForm({ ...editForm, active: e.target.checked })
                              }
                            />
                            Account Active
                          </label>
                        </div>
                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 px-4 py-1.5 text-xs font-semibold text-white"
                        >
                          {savingEdit ? 'Saving...' : 'Save Changes'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke Administrative Access?"
        message={
          revokeTarget
            ? `This will immediately remove ${revokeTarget.role} permissions from ${revokeTarget.email} in MongoDB and demote the account to a standard learner role.`
            : ''
        }
        confirmLabel="Revoke Access"
        destructive
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
