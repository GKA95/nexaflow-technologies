import React, { useEffect, useId, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail, UserPlus } from 'lucide-react';
import { GoogleIcon } from '../../components/GoogleIcon';
import { SEOHead } from '../../components/SEOHead';
import { useApp } from '../../context/AppContext';
import type { AuthUser } from '../../types';
import { apiFetch } from '../../utils/authSession';
import { completeGoogleExchangeToken, startGoogleSignInPopup } from '../../utils/googleAuth';

export function AuthPage({
  mode,
}: {
  mode: 'login' | 'register' | 'forgot' | 'reset';
}) {
  const { user, authLoading, navigate, refreshAuth, setAuthenticatedSession, searchParams, showToast } = useApp();
  const uid = useId();
  const rawRedirect = searchParams.get('redirect') || '/learner';
  const redirectTarget = rawRedirect.startsWith('/') ? rawRedirect : '/learner';
  const queryToken = searchParams.get('token') || '';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState(queryToken);
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  useEffect(() => {
    if (queryToken) setResetToken(queryToken);
  }, [queryToken]);

  useEffect(() => {
    if (!authLoading && user && (mode === 'login' || mode === 'register')) {
      if (user.role === 'admin' || user.role === 'super_admin') {
        navigate('/portal-admin');
      } else {
        navigate(redirectTarget);
      }
    }
  }, [authLoading, user, mode, navigate, redirectTarget]);

  useEffect(() => {
    const exchange = searchParams.get('googleExchange');
    const authErr = searchParams.get('authError');
    if (authErr) setErrorMsg(authErr);
    if (exchange) {
      setGoogleLoading(true);
      completeGoogleExchangeToken(exchange)
        .then(async (res) => {
          if (res.error) {
            setErrorMsg(res.error);
            return;
          }
          if (res.user) {
            setAuthenticatedSession(res.user, res.sessionToken);
          }
          const authed = await refreshAuth();
          const activeUser = authed || res.user;
          showToast('Signed in with Google.', 'success');
          if (activeUser?.role === 'admin' || activeUser?.role === 'super_admin') {
            navigate('/portal-admin');
          } else {
            navigate(redirectTarget);
          }
        })
        .finally(() => setGoogleLoading(false));
    }
  }, [searchParams, refreshAuth, setAuthenticatedSession, showToast, navigate, redirectTarget]);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setInfoMsg('');
    setGoogleLoading(true);
    try {
      const result = await startGoogleSignInPopup('learner');
      if (result.error) {
        setErrorMsg(result.error);
        return;
      }
      if (result.user) {
        setAuthenticatedSession(result.user, result.sessionToken);
      }
      const authed = await refreshAuth();
      const activeUser = authed || result.user;
      showToast('Signed in with Google.', 'success');
      if (activeUser?.role === 'admin' || activeUser?.role === 'super_admin') {
        navigate('/portal-admin');
      } else {
        navigate(redirectTarget);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setInfoMsg('');
    setSubmitting(true);

    try {
      if (mode === 'forgot') {
        const res = await apiFetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, portal: 'learner' }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Could not process password reset request.');
          return;
        }
        setInfoMsg(
          data.message || 'If an account matches that email, a password reset link has been sent.'
        );
        return;
      }

      if (mode === 'reset') {
        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match.');
          return;
        }
        const res = await apiFetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: resetToken, newPassword: password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setErrorMsg(data.error || 'Could not reset password.');
          return;
        }
        showToast('Password updated in MongoDB. Please sign in.', 'success');
        navigate('/auth/login');
        return;
      }

      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const payload =
        mode === 'register'
          ? { name, email, password, phone, organization }
          : { email, password };

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Authentication failed.');
        return;
      }

      const userObj = data.user as AuthUser | undefined;
      const sessionToken = typeof data.sessionToken === 'string' ? data.sessionToken : undefined;
      if (userObj) {
        setAuthenticatedSession(userObj, sessionToken);
      }
      const authed = await refreshAuth();
      const activeUser = authed || userObj;
      showToast(
        mode === 'register' ? 'Learner account created.' : 'Signed in successfully.',
        'success'
      );

      if (activeUser?.role === 'admin' || activeUser?.role === 'super_admin') {
        navigate('/portal-admin');
      } else {
        navigate(redirectTarget);
      }
    } catch {
      setErrorMsg('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const titleText =
    mode === 'register'
      ? 'Create Learner Account'
      : mode === 'forgot'
        ? 'Forgot Password'
        : mode === 'reset'
          ? 'Reset Your Password'
          : 'Sign In to NexaFlow Learn';

  return (
    <>
      <SEOHead
        title={`${titleText} | NexaFlow Learn`}
        description="Access your NexaFlow Learn courses, progress, and support tickets."
        noIndex
      />

      <section className="py-10 sm:py-16 px-4">
        <div className="max-w-md mx-auto rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-white dark:bg-[#080D2B] overflow-hidden shadow-xl">
          <div className="bg-[#03051B] px-6 py-5 sm:py-6 border-b border-[#1A2550] flex justify-center">
            <img
              src="/assets/aistudio/nexaflow_technologies_logo_edf3abcf.png"
              alt="NexaFlow Technologies"
              className="h-11 sm:h-12 w-auto object-contain"
            />
          </div>

          <div className="p-5 sm:p-8">
            {(mode === 'forgot' || mode === 'reset') && (
              <button
                type="button"
                onClick={() => navigate('/auth/login')}
                className="inline-flex items-center gap-1.5 min-h-[40px] text-xs text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#176BFF] dark:hover:text-[#00D4FF] mb-3"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Sign In
              </button>
            )}

            {(mode === 'login' || mode === 'register') && (
              <div className="grid grid-cols-2 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] p-1 mb-5">
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/auth/login?redirect=${encodeURIComponent(redirectTarget)}`)
                  }
                  className={`min-h-[40px] py-2 text-xs font-semibold rounded-md transition-colors ${
                    mode === 'login'
                      ? 'bg-[#176BFF] text-white shadow-sm'
                      : 'text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-[#F7F8FF]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/auth/register?redirect=${encodeURIComponent(redirectTarget)}`)
                  }
                  className={`min-h-[40px] py-2 text-xs font-semibold rounded-md transition-colors ${
                    mode === 'register'
                      ? 'bg-[#176BFF] text-white shadow-sm'
                      : 'text-[#4A5578] dark:text-[#AEB8D4] hover:text-[#070B24] dark:hover:text-[#F7F8FF]'
                  }`}
                >
                  Register
                </button>
              </div>
            )}

            <h1 className="text-xl font-bold text-[#070B24] dark:text-[#F7F8FF]">{titleText}</h1>
            <p className="mt-1.5 text-sm text-[#4A5578] dark:text-[#AEB8D4]">
              {mode === 'register'
                ? 'Register to enrol in courses, track progress, and manage payments.'
                : mode === 'forgot'
                  ? 'Enter your email address to receive a password reset link stored securely in MongoDB.'
                  : mode === 'reset'
                    ? 'Enter a new password for your NexaFlow Learn account.'
                    : 'Sign in to access your enrolled courses and learner dashboard.'}
            </p>

            {(mode === 'login' || mode === 'register') && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={googleLoading}
                  className="mt-5 w-full min-h-[44px] inline-flex items-center justify-center gap-2.5 rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] hover:bg-[#EDF2FA] dark:hover:bg-[#10183A] disabled:opacity-60 py-2.5 px-4 text-sm font-semibold text-[#070B24] dark:text-[#F7F8FF] transition-colors"
                >
                  <GoogleIcon className="w-4 h-4" />
                  {googleLoading ? 'Connecting Google...' : 'Continue with Google'}
                </button>

                <div className="my-5 flex items-center gap-3 text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                  <div className="h-px flex-1 bg-[#DCE3F2] dark:bg-[#1A2550]" />
                  <span>OR</span>
                  <div className="h-px flex-1 bg-[#DCE3F2] dark:bg-[#1A2550]" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor={`${uid}-name`}
                    className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                  >
                    Full Name *
                  </label>
                  <input
                    id={`${uid}-name`}
                    type="text"
                    required
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
                  />
                </div>
              )}

              {mode !== 'reset' && (
                <div>
                  <label
                    htmlFor={`${uid}-email`}
                    className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                  >
                    Email Address *
                  </label>
                  <input
                    id={`${uid}-email`}
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
                  />
                </div>
              )}

              {mode === 'reset' && (
                <div>
                  <label
                    htmlFor={`${uid}-token`}
                    className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                  >
                    Reset Token *
                  </label>
                  <input
                    id={`${uid}-token`}
                    type="text"
                    required
                    autoComplete="one-time-code"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="Paste reset token"
                    className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm font-mono text-[#070B24] dark:text-[#F7F8FF]"
                  />
                </div>
              )}

              {mode !== 'forgot' && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor={`${uid}-password`}
                      className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4]"
                    >
                      {mode === 'reset' ? 'New Password *' : 'Password *'}
                    </label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => navigate('/auth/forgot-password')}
                        className="text-xs font-medium text-[#176BFF] dark:text-[#00D4FF] hover:underline py-1"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    id={`${uid}-password`}
                    type="password"
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    minLength={mode === 'register' || mode === 'reset' ? 8 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === 'register' || mode === 'reset'
                        ? 'Minimum 8 characters'
                        : 'Enter password'
                    }
                    className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF] focus:outline-none focus:border-[#176BFF]"
                  />
                </div>
              )}

              {mode === 'reset' && (
                <div>
                  <label
                    htmlFor={`${uid}-confirm-password`}
                    className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                  >
                    Confirm New Password *
                  </label>
                  <input
                    id={`${uid}-confirm-password`}
                    type="password"
                    required
                    autoComplete="new-password"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3.5 py-2.5 text-sm text-[#070B24] dark:text-[#F7F8FF]"
                  />
                </div>
              )}

              {mode === 'register' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor={`${uid}-phone`}
                      className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                    >
                      Phone (Optional)
                    </label>
                    <input
                      id={`${uid}-phone`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm text-[#070B24] dark:text-[#F7F8FF]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${uid}-org`}
                      className="block text-xs font-medium text-[#4A5578] dark:text-[#AEB8D4] mb-1.5"
                    >
                      Organisation (Optional)
                    </label>
                    <input
                      id={`${uid}-org`}
                      type="text"
                      autoComplete="organization"
                      value={organization}
                      onChange={(e) => setOrganization(e.target.value)}
                      className="w-full min-h-[44px] rounded-lg border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] px-3 py-2 text-sm text-[#070B24] dark:text-[#F7F8FF]"
                    />
                  </div>
                </div>
              )}

              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-300"
                >
                  {errorMsg}
                </div>
              )}

              {infoMsg && (
                <div
                  role="status"
                  className="rounded-lg border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-3.5 py-2.5 text-xs text-[#070B24] dark:text-[#D2F9FF] flex items-start gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#00D4FF]" />
                  <span>{infoMsg}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#176BFF] hover:bg-[#0F56D6] disabled:opacity-60 py-2.5 text-sm font-semibold text-white transition-colors"
              >
                {mode === 'register' ? (
                  <UserPlus className="w-4 h-4" />
                ) : mode === 'forgot' ? (
                  <Mail className="w-4 h-4" />
                ) : mode === 'reset' ? (
                  <KeyRound className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                {submitting
                  ? 'Please wait...'
                  : mode === 'register'
                    ? 'Create Learner Account'
                    : mode === 'forgot'
                      ? 'Send Reset Link'
                      : mode === 'reset'
                        ? 'Update Password'
                        : 'Sign In'}
              </button>
            </form>

            {(mode === 'login' || mode === 'register') && (
              <div className="mt-6 pt-5 border-t border-[#DCE3F2] dark:border-[#1A2550] text-center text-xs text-[#4A5578] dark:text-[#AEB8D4]">
                {mode === 'register' ? (
                  <>
                    Already have a learner account?{' '}
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/auth/login?redirect=${encodeURIComponent(redirectTarget)}`)
                      }
                      className="font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline py-1"
                    >
                      Sign In
                    </button>
                  </>
                ) : (
                  <>
                    New to NexaFlow Learn?{' '}
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/auth/register?redirect=${encodeURIComponent(redirectTarget)}`)
                      }
                      className="font-semibold text-[#176BFF] dark:text-[#00D4FF] hover:underline py-1"
                    >
                      Create Learner Account
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
