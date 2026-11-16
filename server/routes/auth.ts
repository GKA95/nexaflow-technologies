import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { connectDB, getLastDBError, isDBConfigured } from '../db.js';
import {
  authLimiter,
  clearSessionCookie,
  getBaseUrl,
  isGoogleOAuthConfigured,
  optionalAuth,
  requireAuth,
  requireDatabase,
  setSessionCookie,
  signScopedToken,
  signSessionToken,
  stripHtmlTags,
  verifyScopedToken,
} from '../middleware/auth.js';
import { AdminActivity, PasswordResetToken, User } from '../models.js';
import { isEmailConfigured, sendTransactionalEmail } from '../utils/email.js';

const router = Router();

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface OAuthPollEntry {
  ok: boolean;
  exchangeToken?: string;
  portal?: 'admin' | 'learner';
  error?: string;
  expiresAt: number;
}

const googleOAuthResults = new Map<string, OAuthPollEntry>();

function recordOAuthPollResult(
  nonce: string | undefined,
  entry: Omit<OAuthPollEntry, 'expiresAt'>
) {
  if (!nonce) return;
  const now = Date.now();
  for (const [k, v] of googleOAuthResults.entries()) {
    if (v.expiresAt <= now) googleOAuthResults.delete(k);
  }
  googleOAuthResults.set(nonce, { ...entry, expiresAt: now + 5 * 60 * 1000 });
}

function renderPopupResultHtml(params: {
  ok: boolean;
  nonce?: string;
  exchangeToken?: string;
  portal?: 'admin' | 'learner';
  error?: string;
  fallbackPath: string;
}) {
  recordOAuthPollResult(params.nonce, {
    ok: params.ok,
    exchangeToken: params.exchangeToken,
    portal: params.portal,
    error: params.error,
  });

  const payloadJson = JSON.stringify({
    type: 'NF_GOOGLE_AUTH',
    ok: params.ok,
    exchangeToken: params.exchangeToken || '',
    portal: params.portal || 'learner',
    error: params.error || '',
  }).replace(/</g, '\\u003c');

  const safeTitle = params.ok ? 'Google Sign-In Complete' : 'Google Sign-In Failed';
  const safeMsg = params.ok
    ? 'Authentication verified. Returning to NexaFlow...'
    : escapeHtml(params.error || 'Could not complete Google Sign-In.');

  const fallbackUrl =
    params.ok && params.exchangeToken
      ? `${params.fallbackPath}?googleExchange=${encodeURIComponent(params.exchangeToken)}`
      : `${params.fallbackPath}?authError=${encodeURIComponent(params.error || 'Google Sign-In failed')}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <style>
    body { margin:0; font-family: system-ui, -apple-system, sans-serif; background:#03051B; color:#F7F8FF; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:24px; }
    .card { max-width:420px; width:100%; background:#080D2B; border:1px solid #1A2550; border-radius:12px; padding:24px; text-align:center; }
    p { color:#AEB8D4; font-size:14px; line-height:1.5; }
    button, a { display:inline-block; margin-top:16px; background:#176BFF; color:#fff; border:0; border-radius:8px; padding:10px 16px; font-size:13px; font-weight:600; text-decoration:none; cursor:pointer; }
  </style>
</head>
<body>
  <div class="card">
    <h2 style="margin:0 0 8px;font-size:18px;">${safeTitle}</h2>
    <p>${safeMsg}</p>
    <a href="${escapeHtml(fallbackUrl)}" id="fallback-link" style="display:none;">Continue to NexaFlow</a>
  </div>
  <script>
    (function() {
      var payload = ${payloadJson};
      var delivered = false;
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          var ch = new BroadcastChannel('nf_google_auth');
          ch.postMessage(payload);
          ch.close();
          delivered = true;
        }
      } catch (e) {}
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(payload, '*');
          delivered = true;
        }
      } catch (e) {}
      setTimeout(function() {
        try { window.close(); } catch (e) {}
        if (!delivered) {
          document.getElementById('fallback-link').style.display = 'inline-block';
          ${params.ok ? `window.location.replace(${JSON.stringify(fallbackUrl)});` : ''}
        }
      }, 350);
    })();
  </script>
</body>
</html>`;
}

router.get('/providers', (_req, res) => {
  res.json({
    googleConfigured: isGoogleOAuthConfigured(),
    emailConfigured: isEmailConfigured(),
  });
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Full name is required.').max(120),
  email: z.string().trim().email('Valid email address is required.').max(180),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  phone: z.string().trim().max(40).optional().default(''),
  organization: z.string().trim().max(150).optional().default(''),
});

// Public registration strictly creates learner accounts only
router.post('/register', authLimiter, requireDatabase, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid registration data.' });
  }

  const { name, email, password, phone, organization } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await User.findOne({
    $or: [{ email: normalizedEmail }, { secondaryEmails: normalizedEmail }],
  }).lean();
  if (existing) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const created = await User.create({
    name: stripHtmlTags(name),
    email: normalizedEmail,
    passwordHash,
    authProviders: ['local'],
    role: 'learner',
    phone: stripHtmlTags(phone),
    organization: stripHtmlTags(organization),
    active: true,
  });

  const authUser = {
    id: created._id.toString(),
    email: created.email,
    name: created.name,
    role: 'learner' as const,
  };

  const token = signSessionToken(authUser);
  setSessionCookie(req, res, token);

  res.status(201).json({ user: authUser, sessionToken: token });
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post('/login', authLimiter, requireDatabase, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email and password are required.' });
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({
    $or: [{ email: normalizedEmail }, { secondaryEmails: normalizedEmail }],
  }).lean();
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const u = user as unknown as {
    _id: { toString(): string };
    email: string;
    name: string;
    passwordHash?: string;
    role: 'learner' | 'admin' | 'super_admin';
    active: boolean;
  };

  if (!u.active) {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  if (!u.passwordHash) {
    return res.status(401).json({
      error:
        'This account uses Google Sign-In and does not have a password yet. Sign in with Google or use Forgot Password to set one.',
    });
  }

  const valid = await bcrypt.compare(password, u.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const authUser = {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
  };

  const token = signSessionToken(authUser);
  setSessionCookie(req, res, token);

  res.json({ user: authUser, sessionToken: token });
});

// Google Sign-In Step 1: Generate Google OAuth 2.0 Authorization URL
router.get('/google/url', async (req, res) => {
  if (!isGoogleOAuthConfigured()) {
    return res.status(503).json({
      error:
        'Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment secrets.',
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
    });
  }

  if (!isDBConfigured()) {
    return res.status(503).json({
      error: 'MongoDB Atlas must be connected before signing in with Google.',
      code: 'DB_NOT_CONFIGURED',
    });
  }

  const conn = await connectDB();
  if (!conn) {
    const lastErr = getLastDBError();
    return res.status(503).json({
      error:
        lastErr.message ||
        'MongoDB Atlas must be connected before signing in with Google.',
      code: lastErr.code || 'DB_CONNECTION_FAILED',
    });
  }

  const portal = req.query.portal === 'admin' ? 'admin' : 'learner';
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/auth/google/callback`;
  const nonce = crypto.randomUUID();

  const state = signScopedToken(
    {
      purpose: 'google_oauth_state',
      portal,
      nonce,
      redirectUri,
    },
    '10m'
  );

  const pollToken = signScopedToken(
    {
      purpose: 'google_poll',
      nonce,
    },
    '10m'
  );

  const authParams = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
    state,
  });

  res.json({
    url: `https://accounts.google.com/o/oauth2/v2/auth?${authParams.toString()}`,
    pollToken,
  });
});

// Poll OAuth completion status as fallback if COOP/cross-origin severs window.opener
router.get('/google/poll', (req, res) => {
  const pollToken = String(req.query.pollToken || '');
  const decoded = pollToken
    ? verifyScopedToken<{ purpose?: string; nonce?: string }>(pollToken)
    : null;

  if (!decoded || decoded.purpose !== 'google_poll' || !decoded.nonce) {
    return res.status(400).json({ error: 'Invalid poll token.' });
  }

  const entry = googleOAuthResults.get(decoded.nonce);
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) googleOAuthResults.delete(decoded.nonce);
    return res.json({ ready: false });
  }

  googleOAuthResults.delete(decoded.nonce);
  return res.json({
    ready: true,
    ok: entry.ok,
    exchangeToken: entry.exchangeToken || '',
    portal: entry.portal || 'learner',
    error: entry.error || '',
  });
});

// Google Sign-In Step 2: Callback from Google (popup window)
router.get(['/google/callback', '/google/callback/'], async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const stateParam = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  const decodedState = stateParam
    ? verifyScopedToken<{
        purpose?: string;
        portal?: 'admin' | 'learner';
        nonce?: string;
        redirectUri?: string;
      }>(stateParam)
    : null;

  const portal: 'admin' | 'learner' =
    decodedState?.portal === 'admin' ? 'admin' : 'learner';
  const fallbackPath = portal === 'admin' ? '/portal-admin' : '/auth/login';
  const nonce = decodedState?.nonce;

  if (oauthError) {
    return res.status(400).send(
      renderPopupResultHtml({
        ok: false,
        nonce,
        portal,
        fallbackPath,
        error: `Google authorization cancelled or denied (${oauthError}).`,
      })
    );
  }

  if (!code || !decodedState || decodedState.purpose !== 'google_oauth_state') {
    return res.status(400).send(
      renderPopupResultHtml({
        ok: false,
        nonce,
        portal,
        fallbackPath,
        error: 'Invalid or expired Google Sign-In state. Please try again.',
      })
    );
  }

  if (!isGoogleOAuthConfigured()) {
    return res.status(503).send(
      renderPopupResultHtml({
        ok: false,
        nonce,
        portal,
        fallbackPath,
        error: 'Google OAuth credentials are missing on the server.',
      })
    );
  }

  const conn = await connectDB();
  if (!conn) {
    return res.status(503).send(
      renderPopupResultHtml({
        ok: false,
        nonce,
        portal,
        fallbackPath,
        error: 'MongoDB Atlas is not connected.',
      })
    );
  }

  try {
    const redirectUri =
      decodedState.redirectUri || `${getBaseUrl(req)}/api/auth/google/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
        client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(400).send(
        renderPopupResultHtml({
          ok: false,
          nonce,
          portal,
          fallbackPath,
          error:
            tokenData.error_description ||
            tokenData.error ||
            'Failed to exchange Google authorization code.',
        })
      );
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = (await userInfoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!userInfoRes.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
      return res.status(400).send(
        renderPopupResultHtml({
          ok: false,
          nonce,
          portal,
          fallbackPath,
          error: 'Google account email must be verified before signing in.',
        })
      );
    }

    const normalizedEmail = profile.email.toLowerCase();

    let user = await User.findOne({
      $or: [
        { googleId: profile.sub },
        { email: normalizedEmail },
        { secondaryEmails: normalizedEmail },
      ],
    });

    if (portal === 'admin') {
      const adminCount = await User.countDocuments({
        role: { $in: ['admin', 'super_admin'] },
      });
      if (adminCount === 0) {
        return res.status(403).send(
          renderPopupResultHtml({
            ok: false,
            nonce,
            portal,
            fallbackPath,
            error:
              'No administrator exists yet. Complete initial administrator setup first, then you can sign in with Google.',
          })
        );
      }
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).send(
          renderPopupResultHtml({
            ok: false,
            nonce,
            portal,
            fallbackPath,
            error: `Google account (${normalizedEmail}) is not authorized as a NexaFlow administrator. Add this email in Admin Portal -> My Account & Emails or Admin Access first.`,
          })
        );
      }
      if (!user.active) {
        return res.status(403).send(
          renderPopupResultHtml({
            ok: false,
            nonce,
            portal,
            fallbackPath,
            error: 'This administrator account has been deactivated.',
          })
        );
      }
      user.googleId = profile.sub;
      if (profile.picture) user.avatarUrl = profile.picture;
      if (!user.authProviders.includes('google')) user.authProviders.push('google');
      await user.save();

      await AdminActivity.create({
        adminId: user._id,
        adminEmail: user.email,
        action: 'admin_google_signin',
        entityType: 'User',
        entityId: user._id.toString(),
        details: `Signed in via Google (${normalizedEmail})`,
      });
    } else {
      if (user) {
        if (!user.active) {
          return res.status(403).send(
            renderPopupResultHtml({
              ok: false,
              nonce,
              portal,
              fallbackPath,
              error: 'This account has been deactivated.',
            })
          );
        }
        user.googleId = profile.sub;
        if (profile.picture) user.avatarUrl = profile.picture;
        if (!user.authProviders.includes('google')) user.authProviders.push('google');
        await user.save();
      } else {
        user = await User.create({
          name: stripHtmlTags(profile.name || normalizedEmail.split('@')[0]),
          email: normalizedEmail,
          googleId: profile.sub,
          avatarUrl: profile.picture || '',
          authProviders: ['google'],
          role: 'learner',
          active: true,
        });
      }
    }

    const authUser = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role as 'learner' | 'admin' | 'super_admin',
    };

    const sessionToken = signSessionToken(authUser);
    setSessionCookie(req, res, sessionToken);

    const exchangeToken = signScopedToken(
      {
        purpose: 'google_exchange',
        userId: authUser.id,
        portal,
      },
      '3m'
    );

    return res.send(
      renderPopupResultHtml({
        ok: true,
        nonce,
        exchangeToken,
        portal,
        fallbackPath,
      })
    );
  } catch (err) {
    console.error('[Auth] Google OAuth callback error:', err);
    return res.status(500).send(
      renderPopupResultHtml({
        ok: false,
        nonce,
        portal,
        fallbackPath,
        error: 'Unexpected error verifying Google Sign-In. Please try again.',
      })
    );
  }
});

// Google Sign-In Step 3: Complete exchange inside iframe/app context so HTTP-only cookie persists
router.post('/google/complete', authLimiter, requireDatabase, async (req, res) => {
  const token = String(req.body?.exchangeToken || '');
  const decoded = token
    ? verifyScopedToken<{ purpose?: string; userId?: string; portal?: string }>(token)
    : null;

  if (!decoded || decoded.purpose !== 'google_exchange' || !decoded.userId) {
    return res.status(400).json({ error: 'Invalid or expired Google authentication token.' });
  }

  const user = await User.findById(decoded.userId)
    .select('_id email name role active')
    .lean();
  if (!user || !(user as { active?: boolean }).active) {
    return res.status(401).json({ error: 'Account unavailable.' });
  }

  const u = user as unknown as {
    _id: { toString(): string };
    email: string;
    name: string;
    role: 'learner' | 'admin' | 'super_admin';
  };

  const authUser = {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    role: u.role,
  };

  const sessionToken = signSessionToken(authUser);
  setSessionCookie(req, res, sessionToken);
  res.json({ user: authUser, portal: decoded.portal || 'learner', sessionToken });
});

// Forgot Password — creates hashed MongoDB token & delivers reset link via configured email provider
router.post('/forgot-password', authLimiter, requireDatabase, async (req, res) => {
  const schema = z.object({
    email: z.string().trim().email('Valid email address is required.'),
    portal: z.enum(['admin', 'learner']).optional().default('learner'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Valid email is required.' });
  }

  if (!isEmailConfigured()) {
    return res.status(503).json({
      error:
        'Transactional email delivery is not configured yet (set EMAIL_PROVIDER, EMAIL_API_KEY, and EMAIL_FROM). Administrators can also reset using ADMIN_SETUP_TOKEN Recovery.',
      emailConfigured: false,
    });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const portal = parsed.data.portal;

  const user = await User.findOne({
    $or: [{ email: normalizedEmail }, { secondaryEmails: normalizedEmail }],
    active: true,
  });

  const isEligible =
    user &&
    (portal === 'learner' || user.role === 'admin' || user.role === 'super_admin');

  if (isEligible && user) {
    await PasswordResetToken.updateMany(
      { userId: user._id, usedAt: null },
      { $set: { usedAt: new Date() } }
    );

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      portal,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const baseUrl = getBaseUrl(req);
    const resetLink =
      portal === 'admin'
        ? `${baseUrl}/portal-admin?mode=reset&token=${rawToken}`
        : `${baseUrl}/auth/reset-password?token=${rawToken}`;

    const sendResult = await sendTransactionalEmail({
      to: normalizedEmail,
      subject:
        portal === 'admin'
          ? 'NexaFlow Admin Portal — Password Reset Request'
          : 'NexaFlow Learn — Password Reset Request',
      text: `Hello ${user.name},\n\nWe received a request to reset your NexaFlow password.\n\nReset your password using this link (expires in 30 minutes):\n${resetLink}\n\nIf you did not request this, you can safely ignore this message.`,
      html: `<p>Hello ${escapeHtml(user.name)},</p><p>We received a request to reset your NexaFlow password.</p><p><a href="${escapeHtml(resetLink)}" style="display:inline-block;padding:10px 18px;background:#176BFF;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">Reset Password</a></p><p style="font-size:12px;color:#666;">This link expires in 30 minutes. If you did not request this reset, ignore this email.</p>`,
    });

    if (!sendResult.sent) {
      return res.status(502).json({
        error: `Email delivery failed: ${sendResult.error || 'Unknown provider error.'}`,
        emailConfigured: true,
      });
    }
  }

  res.json({
    ok: true,
    emailConfigured: true,
    message:
      'If an active account matches that email address, a password reset link has been sent (valid for 30 minutes).',
  });
});

// Reset Password using MongoDB PasswordResetToken
router.post('/reset-password', authLimiter, requireDatabase, async (req, res) => {
  const schema = z.object({
    token: z.string().trim().min(16, 'Invalid reset token.'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters.').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid reset request.' });
  }

  const tokenHash = crypto.createHash('sha256').update(parsed.data.token).digest('hex');
  const resetDoc = await PasswordResetToken.findOne({
    tokenHash,
    usedAt: null,
    expiresAt: { $gt: new Date() },
  });

  if (!resetDoc) {
    return res.status(400).json({
      error: 'This password reset link is invalid or has expired. Request a new reset link.',
    });
  }

  const user = await User.findById(resetDoc.userId);
  if (!user || !user.active) {
    return res.status(404).json({ error: 'Account not found or deactivated.' });
  }

  if ((user.role === 'admin' || user.role === 'super_admin') && parsed.data.newPassword.length < 10) {
    return res
      .status(400)
      .json({ error: 'Administrator passwords must be at least 10 characters long.' });
  }

  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  if (!user.authProviders.includes('local')) {
    user.authProviders.push('local');
  }
  await user.save();

  resetDoc.usedAt = new Date();
  await resetDoc.save();

  if (user.role === 'admin' || user.role === 'super_admin') {
    await AdminActivity.create({
      adminId: user._id,
      adminEmail: user.email,
      action: 'admin_password_reset',
      entityType: 'User',
      entityId: user._id.toString(),
      details: 'Password reset via MongoDB reset token',
    });
  }

  res.json({
    ok: true,
    portal: resetDoc.portal,
    message: 'Password reset successfully in MongoDB. You can now sign in.',
  });
});

// Owner Admin Password Recovery via Server ADMIN_SETUP_TOKEN (works even when email provider is unconfigured)
router.post('/admin-recovery-reset', authLimiter, requireDatabase, async (req, res) => {
  const envToken = process.env.ADMIN_SETUP_TOKEN?.trim();
  if (!envToken || envToken.includes('replace-with')) {
    return res.status(503).json({
      error:
        'ADMIN_SETUP_TOKEN is not configured in server environment secrets. Configure ADMIN_SETUP_TOKEN or transactional email to reset administrator access.',
    });
  }

  const schema = z.object({
    setupToken: z.string().min(1, 'Setup token is required.'),
    email: z.string().trim().email('Administrator email is required.'),
    newPassword: z.string().min(10, 'Administrator password must be at least 10 characters.').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid recovery payload.' });
  }

  const a = Buffer.from(parsed.data.setupToken);
  const b = Buffer.from(envToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Invalid server setup token.' });
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  const adminUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { secondaryEmails: normalizedEmail }],
    role: { $in: ['admin', 'super_admin'] },
  });

  if (!adminUser) {
    return res.status(404).json({
      error: 'No administrator account in MongoDB matches that email address.',
    });
  }

  adminUser.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  adminUser.active = true;
  if (!adminUser.authProviders.includes('local')) {
    adminUser.authProviders.push('local');
  }
  await adminUser.save();

  await AdminActivity.create({
    adminId: adminUser._id,
    adminEmail: adminUser.email,
    action: 'admin_recovery_password_reset',
    entityType: 'User',
    entityId: adminUser._id.toString(),
    details: 'Administrator password reset via ADMIN_SETUP_TOKEN recovery',
  });

  res.json({
    ok: true,
    message: 'Administrator password updated in MongoDB. You can now sign in.',
  });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.get('/me', optionalAuth, async (req, res) => {
  if (!req.user) {
    return res.json({ user: null });
  }
  return res.json({ user: req.user });
});

router.get('/profile', requireDatabase, requireAuth, async (req, res) => {
  const user = await User.findById(req.user!.id)
    .select(
      '_id name email secondaryEmails role phone organization authProviders googleId avatarUrl passwordHash createdAt'
    )
    .lean();
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const u = user as unknown as {
    _id: unknown;
    name: string;
    email: string;
    secondaryEmails?: string[];
    role: string;
    phone?: string;
    organization?: string;
    authProviders?: string[];
    googleId?: string;
    avatarUrl?: string;
    passwordHash?: string;
    createdAt?: Date;
  };
  res.json({
    profile: {
      _id: u._id,
      name: u.name,
      email: u.email,
      secondaryEmails: u.secondaryEmails || [],
      role: u.role,
      phone: u.phone || '',
      organization: u.organization || '',
      authProviders: u.authProviders || [],
      googleLinked: Boolean(u.googleId),
      avatarUrl: u.avatarUrl || '',
      hasPassword: Boolean(u.passwordHash),
      createdAt: u.createdAt,
    },
  });
});

router.patch('/profile', requireDatabase, requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(40).optional().default(''),
    organization: z.string().trim().max(150).optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid profile data.' });
  }

  const updated = await User.findByIdAndUpdate(
    req.user!.id,
    {
      name: stripHtmlTags(parsed.data.name),
      phone: stripHtmlTags(parsed.data.phone),
      organization: stripHtmlTags(parsed.data.organization),
    },
    { new: true }
  )
    .select('_id name email secondaryEmails role phone organization')
    .lean();

  res.json({ profile: updated });
});

// Update primary login email, secondary emails (for Google/password sign-in), and display name
router.patch('/account-emails', requireDatabase, requireAuth, async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Name is required.').max(120),
    email: z.string().trim().email('Valid primary email is required.').max(180),
    secondaryEmails: z
      .array(z.string().trim().email('All additional emails must be valid email addresses.').max(180))
      .max(10)
      .optional()
      .default([]),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid email settings.' });
  }

  const primaryEmail = parsed.data.email.toLowerCase();
  const cleanedSecondary = Array.from(
    new Set(
      parsed.data.secondaryEmails
        .map((e) => e.toLowerCase())
        .filter((e) => e && e !== primaryEmail)
    )
  );

  const allEmailsToCheck = [primaryEmail, ...cleanedSecondary];
  const conflict = await User.findOne({
    _id: { $ne: req.user!.id },
    $or: [
      { email: { $in: allEmailsToCheck } },
      { secondaryEmails: { $in: allEmailsToCheck } },
    ],
  }).lean();

  if (conflict) {
    return res
      .status(409)
      .json({ error: 'One of those email addresses is already assigned to another account.' });
  }

  const updated = await User.findByIdAndUpdate(
    req.user!.id,
    {
      name: stripHtmlTags(parsed.data.name),
      email: primaryEmail,
      secondaryEmails: cleanedSecondary,
    },
    { new: true }
  );

  if (!updated) return res.status(404).json({ error: 'Account not found.' });

  const authUser = {
    id: updated._id.toString(),
    email: updated.email,
    name: updated.name,
    role: updated.role as 'learner' | 'admin' | 'super_admin',
  };
  const token = signSessionToken(authUser);
  setSessionCookie(req, res, token);

  if (updated.role === 'admin' || updated.role === 'super_admin') {
    await AdminActivity.create({
      adminId: updated._id,
      adminEmail: updated.email,
      action: 'update_admin_emails',
      entityType: 'User',
      entityId: updated._id.toString(),
      details: `Updated primary (${primaryEmail}) and ${cleanedSecondary.length} additional email(s)`,
    });
  }

  res.json({
    user: authUser,
    sessionToken: token,
    profile: {
      _id: updated._id,
      name: updated.name,
      email: updated.email,
      secondaryEmails: updated.secondaryEmails || [],
      role: updated.role,
    },
    message: 'Account emails updated in MongoDB.',
  });
});

router.post('/change-password', requireDatabase, requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().optional().default(''),
    newPassword: z.string().min(8, 'New password must be at least 8 characters.').max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message || 'Invalid password input.' });
  }

  const user = await User.findById(req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if ((user.role === 'admin' || user.role === 'super_admin') && parsed.data.newPassword.length < 10) {
    return res
      .status(400)
      .json({ error: 'Administrator passwords must be at least 10 characters.' });
  }

  // If user already has a password, verify currentPassword; if Google-only, allow setting first password
  if (user.passwordHash) {
    if (!parsed.data.currentPassword) {
      return res.status(400).json({ error: 'Current password is required.' });
    }
    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
  }

  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  if (!user.authProviders.includes('local')) {
    user.authProviders.push('local');
  }
  await user.save();

  if (user.role === 'admin' || user.role === 'super_admin') {
    await AdminActivity.create({
      adminId: user._id,
      adminEmail: user.email,
      action: 'change_admin_password',
      entityType: 'User',
      entityId: user._id.toString(),
      details: 'Administrator password updated in MongoDB',
    });
  }

  res.json({ ok: true, message: 'Password updated successfully in MongoDB.' });
});

export default router;
