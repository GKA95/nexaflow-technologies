import type { AuthUser } from '../types';
import { apiFetch, setStoredSessionToken } from './authSession';

interface GooglePopupPayload {
  type?: string;
  ok?: boolean;
  exchangeToken?: string;
  error?: string;
}

function isTrustedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (origin === window.location.origin) return true;
  if (origin.endsWith('.run.app') || origin.includes('localhost')) return true;
  return false;
}

export async function startGoogleSignInPopup(
  portal: 'admin' | 'learner'
): Promise<{ user?: AuthUser; sessionToken?: string; error?: string }> {
  const urlRes = await apiFetch(`/api/auth/google/url?portal=${portal}`, {
    credentials: 'include',
  });
  const urlData = (await urlRes.json().catch(() => ({}))) as {
    url?: string;
    pollToken?: string;
    error?: string;
  };
  if (!urlRes.ok || !urlData.url) {
    return { error: urlData.error || 'Google Sign-In is unavailable right now.' };
  }

  const width = 520;
  const height = 640;
  const left = Math.max(0, Math.round((window.screen.width - width) / 2));
  const top = Math.max(0, Math.round((window.screen.height - height) / 2));

  const popup = window.open(
    urlData.url,
    'nf_google_oauth',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  if (!popup) {
    return {
      error:
        'Popup was blocked by your browser. Please allow popups for this site to sign in with Google.',
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let processingResult = false;
    let closedCheckInFlight = false;
    let channel: BroadcastChannel | null = null;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      if (channel) {
        try {
          channel.close();
        } catch {
          // ignore
        }
        channel = null;
      }
      clearInterval(closedTimer);
      clearInterval(pollTimer);
    };

    const finish = (result: { user?: AuthUser; sessionToken?: string; error?: string }) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const handlePayload = async (data: GooglePopupPayload) => {
      if (!data || data.type !== 'NF_GOOGLE_AUTH' || settled || processingResult) return;
      processingResult = true;
      // Stop popup-closed checks immediately so closing the popup never races /api/auth/google/complete
      clearInterval(closedTimer);
      clearInterval(pollTimer);

      if (!data.ok || !data.exchangeToken) {
        finish({ error: data.error || 'Google Sign-In failed.' });
        return;
      }

      const completed = await completeGoogleExchangeToken(data.exchangeToken);
      finish(completed);
    };

    const checkServerPoll = async (): Promise<boolean> => {
      if (!urlData.pollToken || settled || processingResult) return false;
      try {
        const res = await apiFetch(
          `/api/auth/google/poll?pollToken=${encodeURIComponent(urlData.pollToken)}`,
          { credentials: 'include' }
        );
        if (!res.ok) return false;
        const pollData = (await res.json()) as {
          ready?: boolean;
          ok?: boolean;
          exchangeToken?: string;
          error?: string;
        };
        if (pollData.ready) {
          await handlePayload({
            type: 'NF_GOOGLE_AUTH',
            ok: pollData.ok,
            exchangeToken: pollData.exchangeToken,
            error: pollData.error,
          });
          return true;
        }
      } catch {
        // ignore transient network check
      }
      return false;
    };

    const onMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) return;
      const data = event.data as GooglePopupPayload;
      if (data?.type === 'NF_GOOGLE_AUTH') {
        void handlePayload(data);
      }
    };

    window.addEventListener('message', onMessage);

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel('nf_google_auth');
        channel.onmessage = (event: MessageEvent) => {
          const data = event.data as GooglePopupPayload;
          if (data?.type === 'NF_GOOGLE_AUTH') {
            void handlePayload(data);
          }
        };
      } catch {
        channel = null;
      }
    }

    const pollTimer = setInterval(() => {
      void checkServerPoll();
    }, 1000);

    const closedTimer = setInterval(async () => {
      if (!popup.closed || settled || processingResult || closedCheckInFlight) return;
      closedCheckInFlight = true;
      try {
        // Give postMessage / BroadcastChannel / callback a brief window before declaring cancelled
        const foundFirst = await checkServerPoll();
        if (foundFirst || settled || processingResult) return;

        await new Promise((r) => setTimeout(r, 400));
        if (settled || processingResult) return;

        const foundRetry = await checkServerPoll();
        if (foundRetry || settled || processingResult) return;

        finish({
          error:
            'Google Sign-In window was closed before completing. If Google displayed an error or blocked sign-in, verify your OAuth Redirect URI, Test Users, and MongoDB connection.',
        });
      } finally {
        closedCheckInFlight = false;
      }
    }, 500);
  });
}

export async function completeGoogleExchangeToken(
  exchangeToken: string
): Promise<{ user?: AuthUser; sessionToken?: string; error?: string }> {
  try {
    const res = await apiFetch('/api/auth/google/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ exchangeToken }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { error: data.error || 'Could not complete Google Sign-In.' };
    }
    if (typeof data.sessionToken === 'string' && data.sessionToken) {
      setStoredSessionToken(data.sessionToken);
    }
    return {
      user: data.user,
      sessionToken: typeof data.sessionToken === 'string' ? data.sessionToken : undefined,
    };
  } catch {
    return { error: 'Network error completing Google Sign-In.' };
  }
}
