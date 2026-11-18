import crypto from 'crypto';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export function isCloudinaryConfigured(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim() || '';
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || '';
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || '';
  return Boolean(
    cloudName &&
      apiKey &&
      apiSecret &&
      !cloudName.includes('replace-with') &&
      !apiKey.includes('replace-with') &&
      !apiSecret.includes('replace-with')
  );
}

function detectMimeFromMagicBytes(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF87a / GIF89a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'image/gif';
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export async function uploadImageToCloudinary(params: {
  dataUri: string;
  folder?: string;
}): Promise<{ secureUrl: string; width?: number; height?: number; format?: string }> {
  if (!isCloudinaryConfigured()) {
    throw new Error('Cloudinary media storage is not configured on the server.');
  }

  const match = params.dataUri.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error('Upload must be a valid PNG, JPEG, WEBP, or GIF image.');
  }

  const declaredMime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(declaredMime)) {
    throw new Error('Unsupported image format. Allowed: PNG, JPEG, WEBP, GIF.');
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('Image size must be greater than 0 bytes and at most 5 MB.');
  }

  const actualMime = detectMimeFromMagicBytes(buffer);
  if (!actualMime || !ALLOWED_MIME_TYPES.has(actualMime)) {
    throw new Error('Uploaded file failed binary image verification.');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME!.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY!.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET!.trim();
  const folder = (params.folder || 'nexaflow-cms').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'nexaflow-cms';
  const timestamp = Math.floor(Date.now() / 1000);

  const signaturePayload = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
  const signature = crypto.createHash('sha1').update(signaturePayload).digest('hex');

  const form = new FormData();
  form.append('file', `data:${actualMime};base64,${buffer.toString('base64')}`);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('folder', folder);
  form.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(20000),
  });

  const result = (await response.json().catch(() => ({}))) as {
    secure_url?: string;
    width?: number;
    height?: number;
    format?: string;
    error?: { message?: string };
  };

  if (!response.ok || !result.secure_url) {
    throw new Error(result.error?.message || 'Cloudinary image upload failed.');
  }

  return {
    secureUrl: result.secure_url,
    width: result.width,
    height: result.height,
    format: result.format,
  };
}
