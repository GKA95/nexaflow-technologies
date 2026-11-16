import crypto from 'crypto';

const PAYSTACK_BASE = 'https://api.paystack.co';

export function isPaystackConfigured(): boolean {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  return Boolean(secret && !secret.includes('your_paystack'));
}

export function getPaystackMode(): 'test' | 'live' {
  const secret = process.env.PAYSTACK_SECRET_KEY?.trim() || '';
  if (secret.startsWith('sk_live_')) return 'live';
  if (process.env.PAYSTACK_MODE === 'live' && !secret.startsWith('sk_test_')) return 'live';
  return 'test';
}

export async function initializePaystackTransaction(params: {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  configured: boolean;
  authorizationUrl?: string;
  accessCode?: string;
  reference?: string;
  error?: string;
}> {
  if (!isPaystackConfigured()) {
    return {
      ok: false,
      configured: false,
      error: 'Paystack credentials are not configured yet (PAYSTACK_SECRET_KEY).',
    };
  }

  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: params.email,
        amount: Math.round(params.amountMinor),
        currency: params.currency.toUpperCase(),
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
      }),
    });

    const data = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: { authorization_url: string; access_code: string; reference: string };
    };

    if (!res.ok || !data.status || !data.data?.authorization_url) {
      return {
        ok: false,
        configured: true,
        error: data.message || 'Paystack refused transaction initialization.',
      };
    }

    return {
      ok: true,
      configured: true,
      authorizationUrl: data.data.authorization_url,
      accessCode: data.data.access_code,
      reference: data.data.reference,
    };
  } catch (err) {
    console.error('[Paystack] Init error:', err);
    return {
      ok: false,
      configured: true,
      error: 'Network error communicating with Paystack.',
    };
  }
}

export async function verifyPaystackTransaction(reference: string): Promise<{
  ok: boolean;
  configured: boolean;
  status?: 'success' | 'failed' | 'abandoned' | 'pending';
  amountMinor?: number;
  currency?: string;
  channel?: string;
  gatewayResponse?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}> {
  if (!isPaystackConfigured()) {
    return {
      ok: false,
      configured: false,
      error: 'Paystack credentials are not configured.',
    };
  }

  try {
    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY!.trim()}`,
      },
    });

    const json = (await res.json()) as {
      status?: boolean;
      message?: string;
      data?: {
        status: string;
        amount: number;
        currency: string;
        channel?: string;
        gateway_response?: string;
        metadata?: Record<string, unknown>;
      };
    };

    if (!res.ok || !json.status || !json.data) {
      return {
        ok: false,
        configured: true,
        error: json.message || 'Unable to verify Paystack transaction.',
      };
    }

    const txStatus = json.data.status;
    let normalized: 'success' | 'failed' | 'abandoned' | 'pending' = 'pending';
    if (txStatus === 'success') normalized = 'success';
    else if (txStatus === 'failed') normalized = 'failed';
    else if (txStatus === 'abandoned') normalized = 'abandoned';

    return {
      ok: true,
      configured: true,
      status: normalized,
      amountMinor: json.data.amount,
      currency: json.data.currency,
      channel: json.data.channel || '',
      gatewayResponse: json.data.gateway_response || '',
      metadata: json.data.metadata || {},
    };
  } catch (err) {
    console.error('[Paystack] Verify error:', err);
    return {
      ok: false,
      configured: true,
      error: 'Network error verifying Paystack transaction.',
    };
  }
}

export function verifyPaystackWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!isPaystackConfigured() || !signatureHeader) return false;
  const secret = process.env.PAYSTACK_SECRET_KEY!.trim();
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(signatureHeader, 'utf8'));
  } catch {
    return false;
  }
}
