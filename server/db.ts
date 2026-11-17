import mongoose from 'mongoose';
import {
  DEFAULT_PRODUCTS,
  DEFAULT_SEO_PAGES,
  DEFAULT_SERVICES,
  DEFAULT_SITE_SETTINGS,
} from './defaults.js';
import { Product, SEOSettings, Service, SiteSettings } from './models.js';

export type DBErrorCode = 'NOT_CONFIGURED' | 'INVALID_URI' | 'AUTH_FAILED' | 'NETWORK_ERROR' | 'UNKNOWN';

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
  bootstrapped: boolean;
  lastErrorCode: DBErrorCode | null;
  lastErrorMessage: string | null;
  lastAttemptAt: number;
  lastUriSignature: string;
}

declare global {
  var __nfMongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.__nfMongooseCache || {
  conn: null,
  promise: null,
  bootstrapped: false,
  lastErrorCode: null,
  lastErrorMessage: null,
  lastAttemptAt: 0,
  lastUriSignature: '',
};
global.__nfMongooseCache = cached;

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function encodeCredentialPart(part: string): string {
  const hasRawReserved = /[@:/?#[\]\s$&+,;=]/.test(part);
  if (!hasRawReserved) {
    try {
      const decoded = decodeURIComponent(part);
      if (decoded !== part) return part;
    } catch {
      // Invalid percent sequence in raw credential -> encode it cleanly
    }
  }
  return encodeURIComponent(part);
}

const HOST_RE =
  /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*(?::\d+)?(?:,[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*(?::\d+)?)*$/;

function isValidHostAndTail(afterAt: string): boolean {
  const slashIdx = afterAt.indexOf('/');
  const queryIdx = afterAt.indexOf('?');
  let hostEnd = afterAt.length;
  if (slashIdx !== -1 && queryIdx !== -1) hostEnd = Math.min(slashIdx, queryIdx);
  else if (slashIdx !== -1) hostEnd = slashIdx;
  else if (queryIdx !== -1) hostEnd = queryIdx;

  const hostCandidate = afterAt.slice(0, hostEnd);
  if (!HOST_RE.test(hostCandidate)) return false;
  if (!hostCandidate.includes('.') && !hostCandidate.startsWith('localhost')) return false;

  const tail = afterAt.slice(hostEnd);
  if (!tail) return true;
  if (!tail.startsWith('/') && !tail.startsWith('?')) return false;

  // A database name path segment (/dbname) should not contain '@'
  const tailQueryIdx = tail.indexOf('?');
  const dbPath = tailQueryIdx === -1 ? tail : tail.slice(0, tailQueryIdx);
  if (dbPath.includes('@')) return false;

  return true;
}

export function normalizeMongoUri(rawEnv?: string): string {
  const cleaned = stripWrappingQuotes(rawEnv || '');
  if (!cleaned) return '';

  const schemeIdx = cleaned.indexOf('://');
  if (schemeIdx === -1) return cleaned;

  const scheme = cleaned.slice(0, schemeIdx + 3);
  const rest = cleaned.slice(schemeIdx + 3);

  let splitIdx = -1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '@' && isValidHostAndTail(rest.slice(i + 1))) {
      splitIdx = i;
      break;
    }
  }

  if (splitIdx === -1) {
    return `${scheme}${rest}`;
  }

  const userInfo = rest.slice(0, splitIdx);
  const hostAndTail = rest.slice(splitIdx + 1);
  const colonIdx = userInfo.indexOf(':');

  if (colonIdx === -1) {
    return `${scheme}${encodeCredentialPart(userInfo)}@${hostAndTail}`;
  }

  const username = userInfo.slice(0, colonIdx);
  const password = userInfo.slice(colonIdx + 1);
  return `${scheme}${encodeCredentialPart(username)}:${encodeCredentialPart(password)}@${hostAndTail}`;
}

function hasPlaceholderToken(uri: string): boolean {
  const lower = uri.toLowerCase();
  return (
    lower.includes('<username>') ||
    lower.includes('<password>') ||
    lower.includes('<db_password>') ||
    lower.includes('<cluster>')
  );
}

export function isDBConfigured(): boolean {
  const uri = stripWrappingQuotes(process.env.MONGODB_URI || '');
  if (!uri) return false;
  if (hasPlaceholderToken(uri)) return false;
  return /^mongodb(\+srv)?:\/\//i.test(uri);
}

export function isDBConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getLastDBError(): { code: DBErrorCode | null; message: string | null } {
  return {
    code: cached.lastErrorCode,
    message: cached.lastErrorMessage,
  };
}

function classifyDBError(err: unknown): { code: DBErrorCode; message: string } {
  const raw = err instanceof Error ? err.message : String(err || '');
  const lower = raw.toLowerCase();

  if (
    lower.includes('bad auth') ||
    lower.includes('authentication failed') ||
    lower.includes('auth failed') ||
    lower.includes('scram')
  ) {
    return {
      code: 'AUTH_FAILED',
      message:
        'MongoDB Atlas rejected your database username or password (bad auth). Verify your Database Access user credentials in Atlas (not your MongoDB Cloud website login) and update MONGODB_URI in Secrets.',
    };
  }

  if (
    lower.includes('enotfound') ||
    lower.includes('querysrv') ||
    lower.includes('timed out') ||
    lower.includes('server selection') ||
    lower.includes('econnrefused') ||
    lower.includes('ip')
  ) {
    return {
      code: 'NETWORK_ERROR',
      message:
        'Could not reach your MongoDB Atlas cluster. Check that Atlas Network Access allows 0.0.0.0/0 and your cluster hostname in MONGODB_URI is correct.',
    };
  }

  if (lower.includes('invalid scheme') || lower.includes('uri')) {
    return {
      code: 'INVALID_URI',
      message:
        'MONGODB_URI format is invalid. Expected mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>?retryWrites=true&w=majority',
    };
  }

  const isProd = process.env.NODE_ENV === 'production';
  return {
    code: 'UNKNOWN',
    message:
      !isProd && raw
        ? `MongoDB connection error: ${raw}`
        : 'Unable to connect to MongoDB Atlas.',
  };
}

async function ensureStructuralDefaults() {
  if (cached.bootstrapped) return;
  try {
    const settingsCount = await SiteSettings.countDocuments();
    if (settingsCount === 0) {
      await SiteSettings.create(DEFAULT_SITE_SETTINGS);
    }

    const servicesCount = await Service.countDocuments();
    if (servicesCount === 0) {
      await Service.insertMany(DEFAULT_SERVICES);
    }

    const productsCount = await Product.countDocuments();
    if (productsCount === 0) {
      await Product.insertMany(DEFAULT_PRODUCTS);
    }

    const seoCount = await SEOSettings.countDocuments();
    if (seoCount === 0) {
      await SEOSettings.insertMany(DEFAULT_SEO_PAGES);
    }

    cached.bootstrapped = true;
  } catch (err) {
    console.error('[DB] Failed to ensure structural defaults:', err);
  }
}

export async function connectDB(options?: { force?: boolean }): Promise<typeof mongoose | null> {
  const rawUri = stripWrappingQuotes(process.env.MONGODB_URI || '');
  if (!rawUri) {
    cached.lastErrorCode = 'NOT_CONFIGURED';
    cached.lastErrorMessage = 'MONGODB_URI is not configured in environment secrets.';
    return null;
  }

  if (hasPlaceholderToken(rawUri) || !/^mongodb(\+srv)?:\/\//i.test(rawUri)) {
    cached.lastErrorCode = 'INVALID_URI';
    cached.lastErrorMessage =
      'MONGODB_URI still contains placeholder text or an invalid scheme. Replace <username>, <password>, and <cluster> with your real Atlas values.';
    return null;
  }

  if (cached.conn && mongoose.connection.readyState === 1 && cached.lastUriSignature === rawUri) {
    cached.lastErrorCode = null;
    cached.lastErrorMessage = null;
    return cached.conn;
  }

  const now = Date.now();
  const uriChanged = cached.lastUriSignature !== rawUri;
  // Avoid hammering Atlas on parallel page-load calls if the same URI just failed within 4s
  if (
    !options?.force &&
    !uriChanged &&
    !cached.promise &&
    cached.lastErrorCode &&
    now - cached.lastAttemptAt < 4000
  ) {
    return null;
  }

  if (!cached.promise || uriChanged) {
    const normalizedUri = normalizeMongoUri(rawUri);
    cached.lastUriSignature = rawUri;
    cached.lastAttemptAt = now;

    cached.promise = (async () => {
      if (uriChanged && mongoose.connection.readyState !== 0) {
        await mongoose.disconnect().catch(() => {});
      }
      mongoose.set('sanitizeFilter', true);
      const isLocalMongo = /^mongodb(?:\+srv)?:\/\/(?:[^/@]*@)?(?:localhost|127\.0\.0\.1)(?:[:/?]|$)/i.test(
        normalizedUri
      );
      const m = await mongoose.connect(normalizedUri, {
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 6000,
        ...(isLocalMongo ? {} : { tls: true, tlsAllowInvalidCertificates: false }),
      });
      cached.conn = m;
      cached.lastErrorCode = null;
      cached.lastErrorMessage = null;
      await ensureStructuralDefaults();
      return m;
    })().catch((err) => {
      cached.promise = null;
      cached.conn = null;
      const classified = classifyDBError(err);
      cached.lastErrorCode = classified.code;
      cached.lastErrorMessage = classified.message;
      console.error('[DB] MongoDB Atlas connection error:', err instanceof Error ? err.message : err);
      throw err;
    });
  }

  try {
    return await cached.promise;
  } catch {
    return null;
  }
}
