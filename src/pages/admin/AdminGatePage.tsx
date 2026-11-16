import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { GoogleIcon } from '../../components/GoogleIcon';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { AuthUser } from '../../types';
import { apiFetch } from '../../utils/authSession';
import { completeGoogleExchangeToken, startGoogleSignInPopup } from '../../utils/googleAuth';
import { AdminPortalShell } from './AdminPortalShell';

interface SetupStatus {
  dbConfigured: boolean;
  dbConnected?: boolean;
  dbErrorCode?: string | null;
  dbError?: string | null;
  adminExists: boolean;
  setupTokenConfigured: boolean;
  googleConfigured?: boolean;
  emailConfigured?: boolean;
  isProduction?: boolean;
}

type GateView = 'login' | 'forgot' | 'recovery' | 'reset';

export function AdminGatePage() {
  const {
    user,
    authLoading,
    refreshAuth,
    setAuthenticatedSession,
    logout,
    navigate,
    searchParams,
    showToast,
  } = useApp();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [loading, setLoading] = useState(true);

  const initialToken = searchParams.get('token') || '';
  const initialMode = searchParams.get('mode');
  const [view, setView] = useState<GateView>(
    initialMode === 'reset' && initialToken ? 'reset' : 'login'
  );

  // Setup & Auth state
  const [setupToken, setSetupToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [secondaryEmailsInput, setSecondaryEmailsInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialToken);

  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const loadStatus = useCallback(async (forceRetry = false) => {
    setLoading(true);
    setStatusError('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const url = forceRetry ? '/api/admin/setup-status?retry=1' : '/api/admin/setup-status';
      const res = await apiFetch(url, {
        credentials: 'include',
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Backend API returned HTML instead of JSON. Ensure serverless /api routes are deployed.');
      }
      const data = (await res.json()) as SetupStatus;
      setStatus(data);
    } catch (err) {
      setStatus(null);
      setStatusError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Connection check timed out. Verify your MongoDB Atlas network access and server status.'
          : err instanceof Error && err.message
            ? `Could not reach the NexaFlow backend server (${err.message}).`
            : 'Could not reach the NexaFlow backend server.'
      );
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Handle Google OAuth fallback token or error if popup redirected in same tab
  useEffect(() => {
    const exchange = searchParams.get('googleExchange');
    const authErr = searchParams.get('authError');
    if (authErr) {
      setErrorMsg(authErr);
    }
    if (exchange) {
      setGoogleLoading(true);
      completeGoogleExchangeToken(exchange)
        .then(async (res) => {
          if (res.error) {
            setErrorMsg(res.error);
            return;
          }
          if (res.user) {
            if (res.user.role !== 'admin' && res.user.role !== 'super_admin') {
              setErrorMsg('This Google account does not have administrator privileges.');
              await logout();
              return;
            }
            setAuthenticatedSession(res.user, res.sessionToken);
          }
          await refreshAuth();
          showToast('Signed in to NexaFlow Admin Portal with Google.', 'success');
          window.history.replaceState({}, '', '/portal-admin');
        })
        .finally(() => setGoogleLoading(false));
    }
  }, [searchParams, refreshAuth, setAuthenticatedSession, logout, showToast]);

  const readApiResponse = async (res: Response): Promise<Record<string, unknown>> => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {
        error: `Server returned HTTP ${res.status} (${res.statusText || 'unexpected response'}).`,
      };
    }
  };

  const handleInitialSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    const secondaryEmails = secondaryEmailsInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    setSubmitting(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await apiFetch('/api/admin/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify({
          setupToken,
          name,
          email,
          secondaryEmails,
          password,
        }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setErrorMsg(String(data.error || `Setup failed (HTTP ${res.status}).`));
        return;
      }
      const userObj = data.user as AuthUser | undefined;
      const sessionToken = typeof data.sessionToken === 'string' ? data.sessionToken : undefined;
      if (userObj) {
        setAuthenticatedSession(userObj, sessionToken);
      }
      await refreshAuth();
      showToast('Administrator portal initialized and signed in.', 'success');
      loadStatus();
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.name === 'AbortError'
          ? 'Administrator setup timed out. Check your MongoDB Atlas connection and try again.'
          : err instanceof Error && err.message
            ? `Could not complete setup: ${err.message}`
            : 'Network error during administrator setup.'
      );
    } finally {
      clearTimeout(timer);
      setSubmitting(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setErrorMsg(String(data.error || `Sign in failed (HTTP ${res.status}).`));
        return;
      }
      const userObj = data.user as AuthUser | undefined;
      if (!userObj || (userObj.role !== 'admin' && userObj.role !== 'super_admin')) {
        await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
        setAuthenticatedSession(null);
        setErrorMsg('This account does not have administrator privileges.');
        return;
      }
      const sessionToken = typeof data.sessionToken === 'string' ? data.sessionToken : undefined;
      setAuthenticatedSession(userObj, sessionToken);
      await refreshAuth();
      showToast('Signed in to NexaFlow Admin Portal.', 'success');
    } catch (err) {
      setErrorMsg(
        err instanceof Error && err.message
          ? `Could not sign in: ${err.message}`
          : 'Network error signing in.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleLoading(true);
    try {
      const result = await startGoogleSignInPopup('admin');
      if (result.error) {
        setErrorMsg(result.error);
        return;
      }
      if (result.user) {
        if (result.user.role !== 'admin' && result.user.role !== 'super_admin') {
          await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
          setAuthenticatedSession(null);
          setErrorMsg('This Google account does not have administrator privileges.');
          return;
        }
        setAuthenticatedSession(result.user, result.sessionToken);
      }
      await refreshAuth();
      showToast('Signed in with Google.', 'success');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, portal: 'admin' }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setErrorMsg(String(data.error || 'Could not process password reset request.'));
        return;
      }
      setInfoMsg(
        String(
          data.message || 'If an administrator account matches that email, a reset link has been sent.'
        )
      );
    } catch {
      setErrorMsg('Network error sending reset request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (password.length < 10) {
      setErrorMsg('Administrator password must be at least 10 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: password }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setErrorMsg(String(data.error || 'Password reset failed.'));
        return;
      }
      setInfoMsg(String(data.message || 'Password updated in MongoDB. Please sign in.'));
      setPassword('');
      setConfirmPassword('');
      setView('login');
      window.history.replaceState({}, '', '/portal-admin');
    } catch {
      setErrorMsg('Network error resetting password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTokenRecoveryReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    if (password.length < 10) {
      setErrorMsg('Administrator password must be at least 10 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/auth/admin-recovery-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken, email, newPassword: password }),
      });
      const data = await readApiResponse(res);
      if (!res.ok) {
        setErrorMsg(String(data.error || 'Recovery reset failed.'));
        return;
      }
      setInfoMsg(
        String(data.message || 'Administrator password updated in MongoDB. You can sign in now.')
      );
      setPassword('');
      setConfirmPassword('');
      setSetupToken('');
      setView('login');
    } catch {
      setErrorMsg('Network error resetting administrator password.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!authLoading && user && (user.role === 'admin' || user.role === 'super_admin')) {
    return <AdminPortalShell />;
  }

  if (loading || authLoading) {
    return (
      <>
        <SEOHead
          title="Administrator Portal | NexaFlow Technologies"
          description="Protected NexaFlow Technologies administrator access."
          noIndex
        />
        <div className="min-h-screen bg-[#03051B] text-[#F7F8FF] flex flex-col items-center justify-center p-6 gap-4">
          <div className="w-8 h-8 rounded-full border-2 border-[#1A2550] border-t-[#00D4FF] animate-spin" />
          <p className="text-sm text-[#AEB8D4]">Loading NexaFlow Administrator Portal...</p>
        </div>
      </>
    );
  }

  const dbReady = Boolean(status?.dbConfigured && status?.dbConnected !== false);

  return (
    <>
      <SEOHead
        title="Administrator Portal | NexaFlow Technologies"
        description="Private NexaFlow Technologies administrator management portal."
        noIndex
      />

      <div className="min-h-screen bg-[#03051B] text-[#F7F8FF] flex flex-col justify-between p-4 sm:p-6">
        {/* Top Portal Identity Bar (separate from public site) */}
        <header className="max-w-lg w-full mx-auto pt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-[#00D4FF]">
            <ShieldCheck className="w-4 h-4" />
            <span>NEXAFLOW PRIVATE ADMIN CONSOLE</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs text-[#AEB8D4] hover:text-[#F7F8FF] transition-colors"
          >
            Back to Public Site
          </button>
        </header>

        <main className="my-auto py-8">
          <div className="w-full max-w-lg mx-auto rounded-xl border border-[#1A2550] bg-[#080D2B] overflow-hidden shadow-2xl">
            <div className="bg-[#03051B] px-6 py-5 border-b border-[#1A2550] flex items-center justify-between gap-4">
              <img
                src="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png"
                alt="NexaFlow Technologies"
                className="h-10 w-auto object-contain"
              />
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#AEB8D4]">
                MongoDB Auth
              </span>
            </div>

            <div className="p-6 sm:p-8 space-y-5">
              {/* If user is logged in as learner on public site */}
              {user && user.role === 'learner' && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-2">
                  <p>
                    You are currently signed in as a learner (<strong>{user.email}</strong>). Sign out
                    to access the separate Administrator Portal.
                  </p>
                  <button
                    type="button"
                    onClick={logout}
                    className="rounded-md bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 px-3 py-1.5 font-semibold text-amber-100"
                  >
                    Sign Out Learner Session
                  </button>
                </div>
              )}

              {/* Server / Database status notice */}
              {statusError ? (
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <h1 className="text-lg font-bold">Connection Check Failed</h1>
                      <p className="mt-1 text-sm text-[#AEB8D4]">{statusError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadStatus(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] py-2.5 text-sm font-semibold text-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry Connection
                  </button>
                </div>
              ) : !dbReady ? (
                <div className="space-y-5">
                  <div className="flex items-start gap-3">
                    <Database className="w-6 h-6 text-[#00D4FF] shrink-0 mt-0.5" />
                    <div>
                      <h1 className="text-lg font-bold">Connect MongoDB Atlas to Unlock Admin Portal</h1>
                      <p className="mt-1.5 text-sm text-[#AEB8D4] leading-relaxed">
                        {!status?.dbConfigured
                          ? status?.dbError ||
                            'Your admin credentials, custom login emails, Google Sign-In link, password resets, and platform data are stored in MongoDB Atlas.'
                          : status?.dbError ||
                            'MONGODB_URI is present, but the server could not reach MongoDB Atlas. Check your cluster credentials and IP access list.'}
                      </p>
                    </div>
                  </div>

                  {status?.dbErrorCode === 'AUTH_FAILED' && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-1.5">
                      <p className="font-semibold text-amber-100">How to fix Atlas Authentication Failed (bad auth):</p>
                      <p>1. Open MongoDB Atlas → <strong>Security → Database Access</strong> (use your Database User, not your Atlas website login).</p>
                      <p>2. Click <strong>Edit → Edit Password</strong> to confirm or reset the database password.</p>
                      <p>3. Update <code className="font-mono">MONGODB_URI</code> in Secrets with that exact username and password (no angle brackets <code className="font-mono">&lt;&gt;</code>).</p>
                    </div>
                  )}

                  <div className="rounded-lg border border-[#1A2550] bg-[#03051B] p-4 text-xs font-mono text-[#AEB8D4] space-y-2">
                    <p className="text-[#F7F8FF] font-semibold">Environment Secrets Panel Checklist:</p>
                    <p>
                      <span className={status?.dbConfigured ? 'text-emerald-400' : 'text-amber-400'}>
                        {status?.dbConfigured ? '[SET]' : '[REQUIRED]'}
                      </span>{' '}
                      MONGODB_URI — MongoDB Atlas connection string
                    </p>
                    <p>
                      <span className={status?.googleConfigured ? 'text-emerald-400' : 'text-[#AEB8D4]'}>
                        {status?.googleConfigured ? '[SET]' : '[OPTIONAL]'}
                      </span>{' '}
                      GOOGLE_CLIENT_ID &amp; GOOGLE_CLIENT_SECRET — Google Sign-In
                    </p>
                    <p>
                      <span className={status?.emailConfigured ? 'text-emerald-400' : 'text-[#AEB8D4]'}>
                        {status?.emailConfigured ? '[SET]' : '[OPTIONAL]'}
                      </span>{' '}
                      EMAIL_PROVIDER / EMAIL_API_KEY / EMAIL_FROM — Reset emails
                    </p>
                    <p>
                      <span className={status?.setupTokenConfigured ? 'text-emerald-400' : 'text-[#AEB8D4]'}>
                        {status?.setupTokenConfigured ? '[SET]' : '[OPTIONAL]'}
                      </span>{' '}
                      ADMIN_SETUP_TOKEN — Extra lock &amp; recovery token
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => loadStatus(true)}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] py-2.5 text-sm font-semibold text-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Re-check MongoDB Connection
                  </button>
                </div>
              ) : !status?.adminExists ? (
                /* Initial Setup: Owner creates their own Admin Emails & Password in MongoDB */
                <div>
                  <div className="flex items-center gap-2 text-[#00D4FF] text-xs font-medium mb-2">
                    <ShieldCheck className="w-4 h-4" />
                    First-Time Owner Setup (Linked to MongoDB)
                  </div>
                  <h1 className="text-xl font-bold">Set Your Administrator Emails &amp; Password</h1>
                  <p className="mt-1.5 text-sm text-[#AEB8D4]">
                    Create your private Super Administrator account. You can change your emails, add
                    additional authorised emails, or update your password anytime inside the portal.
                  </p>

                  {status?.isProduction && !status?.setupTokenConfigured && (
                    <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                      Production mode requires <code className="font-mono">ADMIN_SETUP_TOKEN</code> in
                      server secrets before completing initial setup.
                    </div>
                  )}

                  <form onSubmit={handleInitialSetup} className="mt-5 space-y-4">
                    {status?.setupTokenConfigured && (
                      <div>
                        <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                          Server Setup Token (ADMIN_SETUP_TOKEN) *
                        </label>
                        <input
                          type="password"
                          required
                          value={setupToken}
                          onChange={(e) => setSetupToken(e.target.value)}
                          placeholder="Enter your configured ADMIN_SETUP_TOKEN"
                          className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Your Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Owner / Administrator Name"
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Primary Administrator Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@yourdomain.com"
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Additional Login / Google Sign-In Emails (Optional)
                      </label>
                      <input
                        type="text"
                        value={secondaryEmailsInput}
                        onChange={(e) => setSecondaryEmailsInput(e.target.value)}
                        placeholder="e.g. your.gmail@gmail.com, founder@company.com"
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                      <p className="mt-1 text-[11px] text-[#AEB8D4]/80">
                        Comma-separated. Any email listed here works for Google Sign-In, Password Login,
                        and Password Resets.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                          Password (min 10 chars) *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={10}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                          Confirm Password *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={10}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                        />
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 py-2.5 text-sm font-semibold text-white"
                    >
                      <KeyRound className="w-4 h-4" />
                      {submitting ? 'Creating Administrator...' : 'Save Credentials & Enter Portal'}
                    </button>
                  </form>
                </div>
              ) : view === 'forgot' ? (
                /* Forgot Password Form */
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setInfoMsg('');
                      setView('login');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-[#AEB8D4] hover:text-[#00D4FF] mb-4"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Administrator Sign In
                  </button>

                  <h1 className="text-xl font-bold">Forgotten Administrator Password</h1>
                  <p className="mt-1.5 text-sm text-[#AEB8D4]">
                    Enter your primary or secondary administrator email to receive a 30-minute reset
                    link stored securely in MongoDB.
                  </p>

                  <form onSubmit={handleForgotPassword} className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Administrator Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@yourdomain.com"
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>

                    {errorMsg && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                        {errorMsg}
                      </div>
                    )}
                    {infoMsg && (
                      <div className="rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-3.5 py-2.5 text-xs text-[#D2F9FF] flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#00D4FF]" />
                        <span>{infoMsg}</span>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 py-2.5 text-sm font-semibold text-white"
                    >
                      <Mail className="w-4 h-4" />
                      {submitting ? 'Sending Reset Link...' : 'Send Password Reset Email'}
                    </button>
                  </form>

                  <div className="mt-5 pt-4 border-t border-[#1A2550] flex items-center justify-between text-xs text-[#AEB8D4]">
                    <span>Have a reset token or server token?</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setErrorMsg('');
                          setInfoMsg('');
                          setView('reset');
                        }}
                        className="text-[#00D4FF] hover:underline"
                      >
                        Enter Reset Token
                      </button>
                      {status?.setupTokenConfigured && (
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg('');
                            setInfoMsg('');
                            setView('recovery');
                          }}
                          className="text-[#00D4FF] hover:underline"
                        >
                          Server Token Recovery
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : view === 'reset' ? (
                /* Reset Password with MongoDB Token */
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setInfoMsg('');
                      setView('login');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-[#AEB8D4] hover:text-[#00D4FF] mb-4"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Sign In
                  </button>

                  <h1 className="text-xl font-bold">Reset Administrator Password</h1>
                  <p className="mt-1.5 text-sm text-[#AEB8D4]">
                    Set a new administrator password (minimum 10 characters).
                  </p>

                  <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Reset Token *
                      </label>
                      <input
                        type="text"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="Paste token from your reset link"
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm font-mono text-[#F7F8FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        New Password (min 10 chars) *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={10}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Confirm New Password *
                      </label>
                      <input
                        type="password"
                        required
                        minLength={10}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>

                    {errorMsg && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 py-2.5 text-sm font-semibold text-white"
                    >
                      <KeyRound className="w-4 h-4" />
                      {submitting ? 'Updating Password...' : 'Reset Password'}
                    </button>
                  </form>
                </div>
              ) : view === 'recovery' ? (
                /* Server Token Recovery Reset */
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMsg('');
                      setInfoMsg('');
                      setView('login');
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-[#AEB8D4] hover:text-[#00D4FF] mb-4"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Sign In
                  </button>

                  <h1 className="text-xl font-bold">Owner Recovery via Server Token</h1>
                  <p className="mt-1.5 text-sm text-[#AEB8D4]">
                    Reset your MongoDB administrator password using your server{' '}
                    <code className="font-mono text-[#00D4FF]">ADMIN_SETUP_TOKEN</code>.
                  </p>

                  <form onSubmit={handleTokenRecoveryReset} className="mt-5 space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        ADMIN_SETUP_TOKEN *
                      </label>
                      <input
                        type="password"
                        required
                        value={setupToken}
                        onChange={(e) => setSetupToken(e.target.value)}
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Administrator Email *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                          New Password (10+ chars) *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={10}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                          Confirm Password *
                        </label>
                        <input
                          type="password"
                          required
                          minLength={10}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                        />
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 py-2.5 text-sm font-semibold text-white"
                    >
                      <KeyRound className="w-4 h-4" />
                      {submitting ? 'Resetting Password...' : 'Reset Administrator Password'}
                    </button>
                  </form>
                </div>
              ) : (
                /* Standard Administrator Sign In (Google + Email/Password + Forgot Password) */
                <div>
                  <h1 className="text-xl font-bold">Administrator Sign In</h1>
                  <p className="mt-1.5 text-sm text-[#AEB8D4]">
                    Private NexaFlow management portal. Sign in with your authorised Google account or
                    configured email and password.
                  </p>

                  {infoMsg && (
                    <div className="mt-4 rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-3.5 py-2.5 text-xs text-[#D2F9FF] flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#00D4FF]" />
                      <span>{infoMsg}</span>
                    </div>
                  )}

                  {/* Google Sign-In Button */}
                  <div className="mt-5">
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      disabled={googleLoading}
                      className="w-full inline-flex items-center justify-center gap-2.5 rounded-lg border border-[#1A2550] bg-[#03051B] hover:bg-[#10183A] disabled:opacity-60 py-2.5 px-4 text-sm font-semibold text-[#F7F8FF] transition-colors"
                    >
                      <GoogleIcon className="w-4 h-4" />
                      {googleLoading ? 'Verifying with Google...' : 'Sign in with Google'}
                    </button>
                    {!status?.googleConfigured && (
                      <p className="mt-1.5 text-[11px] text-[#AEB8D4]/75 text-center">
                        Requires <code className="font-mono">GOOGLE_CLIENT_ID</code> &amp;{' '}
                        <code className="font-mono">GOOGLE_CLIENT_SECRET</code> in server secrets.
                      </p>
                    )}
                  </div>

                  <div className="my-5 flex items-center gap-3 text-xs text-[#AEB8D4]/70">
                    <div className="h-px flex-1 bg-[#1A2550]" />
                    <span>OR SIGN IN WITH EMAIL</span>
                    <div className="h-px flex-1 bg-[#1A2550]" />
                  </div>

                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-[#AEB8D4] mb-1">
                        Administrator Email
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@yourdomain.com"
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-[#AEB8D4]">Password</label>
                        <button
                          type="button"
                          onClick={() => {
                            setErrorMsg('');
                            setInfoMsg('');
                            setView('forgot');
                          }}
                          className="text-xs text-[#00D4FF] hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full rounded-lg border border-[#1A2550] bg-[#03051B] px-3.5 py-2.5 text-sm text-[#F7F8FF]"
                      />
                    </div>

                    {errorMsg && (
                      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs text-red-300">
                        {errorMsg}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 py-2.5 text-sm font-semibold text-white"
                    >
                      <Lock className="w-4 h-4" />
                      {submitting ? 'Signing In...' : 'Sign In to Admin Portal'}
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </main>

        <footer className="max-w-lg w-full mx-auto pb-4 text-center text-[11px] text-[#AEB8D4]/60">
          Protected Administrator Console &middot; All sessions and credentials stored in MongoDB Atlas
        </footer>
      </div>
    </>
  );
}
