import type { z } from 'zod';
import { zodToFieldErrors } from '../../server/shared/validation';

export * from '../../server/shared/validation';

export type FieldErrors = Record<string, string>;

export function validateWithSchema<T>(
  schema: z.ZodType<T>,
  data: unknown
): { ok: true; data: T } | { ok: false; fieldErrors: FieldErrors; message: string } {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const fieldErrors = zodToFieldErrors(parsed.error);
  const firstMessage =
    parsed.error.issues[0]?.message || 'Please check the highlighted form fields.';
  return { ok: false, fieldErrors, message: firstMessage };
}

export function fieldBorderClass(
  baseClass: string,
  hasError?: string | boolean
): string {
  if (!hasError) return baseClass;
  return `${baseClass} !border-rose-500/80 focus:!border-rose-400 focus:!ring-rose-500/30`;
}
