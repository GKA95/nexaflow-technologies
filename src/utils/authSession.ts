const SESSION_TOKEN_KEY = 'nf_session_token';
let memorySessionToken: string | null = null;

export function getStoredSessionToken(): string | null {
  if (memorySessionToken) return memorySessionToken;
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (stored) {
      memorySessionToken = stored;
      return stored;
    }
  } catch {
    // Fallback to in-memory token when storage is blocked
  }
  return null;
}

export function setStoredSessionToken(token: string | null | undefined) {
  const cleaned = typeof token === 'string' ? token.trim() : '';
  if (!cleaned) return;
  memorySessionToken = cleaned;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_TOKEN_KEY, cleaned);
  } catch {
    // Ignore storage quota / sandbox restrictions
  }
}

export function clearStoredSessionToken() {
  memorySessionToken = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getStoredSessionToken();
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined)
  );
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const nextInit: RequestInit = {
    ...init,
    credentials: init?.credentials ?? 'include',
    headers,
  };

  if (input instanceof Request) {
    return window.fetch(new Request(input, nextInit));
  }
  return window.fetch(input, nextInit);
}
