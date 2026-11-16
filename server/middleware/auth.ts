import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { connectDB, getLastDBError, isDBConfigured } from '../db.js';
import { User } from '../models.js';

export const SESSION_COOKIE_NAME = 'nf_session';

const EPHEMERAL_DEV_SECRET = crypto.randomBytes(32).toString('hex');

export function isJwtSecretConfigured(): boolean {
  const configured = process.env.JWT_SECRET?.trim();
  return Boolean(configured && configured.length >= 16 && !configured.includes('replace-with'));
}

function getJwtSecret(): string {
  const configured = process.env.JWT_SECRET?.trim();
  if (configured && configured.length >= 16 && !configured.includes('replace-with')) {
    return configured;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET environment variable must be configured in production.');
  }
  return EPHEMERAL_DEV_SECRET;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'learner' | 'admin' | 'super_admin';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function getBaseUrl(req: Request): string {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const host = forwardedHost || req.get('host') || '';
  const proto =
    (typeof req.headers['x-forwarded-proto'] === 'string'
      ? req.headers['x-forwarded-proto'].split(',')[0].trim()
      : '') ||
    req.protocol ||
    'https';

  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    return `${proto}://${host}`;
  }

  const configured = process.env.APP_URL?.trim().replace(/\/+$/, '');
  if (configured && /^https?:\/\//i.test(configured) && !configured.includes('MY_APP_URL')) {
    return configured;
  }

  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

export function isGoogleOAuthConfigured(): boolean {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  return Boolean(
    id &&
      secret &&
      !id.includes('your_') &&
      !secret.includes('your_') &&
      !id.includes('MY_') &&
      !secret.includes('MY_')
  );
}

export function signSessionToken(payload: AuthUser): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifySessionToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthUser;
  } catch {
    return null;
  }
}

export function signScopedToken(payload: Record<string, unknown>, expiresIn: '10m' | '3m'): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
}

export function verifyScopedToken<T extends Record<string, unknown>>(token: string): T | null {
  try {
    return jwt.verify(token, getJwtSecret()) as T;
  } catch {
    return null;
  }
}

function isSecureRequest(req: Request): boolean {
  const origin = String(req.headers.origin || '');
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '');
  return (
    req.protocol === 'https' ||
    forwardedProto.includes('https') ||
    origin.startsWith('https://')
  );
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer && bearer !== 'null' && bearer !== 'undefined') {
      return bearer;
    }
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken ? cookieToken : null;
}

export function setSessionCookie(req: Request, res: Response, token: string) {
  const isSecure = isSecureRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookie(req: Request, res: Response) {
  const isSecure = isSecureRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: isSecure ? 'none' : 'lax',
    secure: isSecure,
    path: '/',
  });
}

export async function requireDatabase(req: Request, res: Response, next: NextFunction) {
  if (!isDBConfigured()) {
    const lastErr = getLastDBError();
    return res.status(503).json({
      error:
        lastErr.message ||
        'MongoDB Atlas is not configured yet. Configure MONGODB_URI in environment secrets.',
      code: lastErr.code === 'INVALID_URI' ? 'DB_INVALID_URI' : 'DB_NOT_CONFIGURED',
    });
  }
  const conn = await connectDB();
  if (!conn) {
    const lastErr = getLastDBError();
    return res.status(503).json({
      error:
        lastErr.message ||
        'Unable to reach MongoDB Atlas right now. Verify MONGODB_URI and IP access rules.',
      code: lastErr.code || 'DB_CONNECTION_FAILED',
    });
  }
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractSessionToken(req);
  if (!token) return next();
  const decoded = verifySessionToken(token);
  if (!decoded) return next();

  if (isDBConfigured()) {
    try {
      const conn = await connectDB();
      if (conn) {
        const user = await User.findById(decoded.id).select('_id email name role active').lean();
        if (!user || !(user as { active?: boolean }).active) {
          return next();
        }
        const u = user as unknown as {
          _id: { toString(): string };
          email: string;
          name: string;
          role: AuthUser['role'];
        };
        req.user = {
          id: u._id.toString(),
          email: u.email,
          name: u.name,
          role: u.role,
        };
        return next();
      }
    } catch {
      // fall back to decoded JWT if transient DB hiccup
    }
  }

  req.user = decoded;
  next();
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractSessionToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }

  if (isDBConfigured()) {
    await connectDB();
    const user = await User.findById(decoded.id).select('_id email name role active').lean();
    if (!user || !(user as { active?: boolean }).active) {
      return res.status(401).json({ error: 'Account unavailable.' });
    }
    const u = user as unknown as {
      _id: { toString(): string };
      email: string;
      name: string;
      role: AuthUser['role'];
    };
    req.user = {
      id: u._id.toString(),
      email: u.email,
      name: u.name,
      role: u.role,
    };
  } else {
    req.user = decoded;
  }

  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
    return res.status(403).json({ error: 'Administrator privileges required.' });
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super administrator privileges required.' });
  }
  next();
}

export function csrfOriginCheck(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  if (req.path === '/api/payments/webhook') {
    return next();
  }
  const origin = req.headers.origin;
  const host = req.headers.host;
  const forwardedHost = String(req.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  if (origin && (host || forwardedHost)) {
    try {
      const originHost = new URL(origin).host;
      if (originHost !== host && originHost !== forwardedHost) {
        return res.status(403).json({ error: 'Cross-origin request rejected.' });
      }
    } catch {
      return res.status(403).json({ error: 'Invalid origin header.' });
    }
  }
  next();
}

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please wait 15 minutes and try again.' },
});

export const leadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many enquiry submissions. Please wait a few minutes before retrying.' },
});

export const supportLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many support requests. Please wait a few minutes.' },
});

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const match = trimmed.match(p);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function sanitizeCsvCell(val: unknown): string {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${neutralized.replace(/"/g, '""')}"`;
}

export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

const BLOCKED_DOWNLOADER_PATTERNS = [
  /\bidm\b/i,
  /internet download manager/i,
  /yt-dlp/i,
  /youtube-dl/i,
  /jdownloader/i,
  /freedownloadmanager/i,
  /\bfdm\b/i,
  /eagleget/i,
  /aria2/i,
  /\bwget\b/i,
  /httrack/i,
  /flashget/i,
  /getright/i,
  /mass downloader/i,
];

export function blockDownloadManagers(req: Request, res: Response, next: NextFunction) {
  const ua = String(req.headers['user-agent'] || '');
  if (BLOCKED_DOWNLOADER_PATTERNS.some((pattern) => pattern.test(ua))) {
    return res.status(403).json({
      error: 'Automated download managers and stream rippers are blocked on NexaFlow Learn.',
      code: 'DOWNLOADER_BLOCKED',
    });
  }
  next();
}

