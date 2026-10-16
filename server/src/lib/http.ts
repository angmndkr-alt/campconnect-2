import type { Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z, type ZodIssue, type ZodType } from 'zod';
import { HttpError } from './errors.js';

/**
 * Express 5 made `req.query` and `req.params` read-only getters, so this helper
 * parses both together and returns plain values for the handler to use.
 * Throws a 400 HttpError with field-level details on failure.
 */
export function parseRequest<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse({ query: req.query, params: req.params });
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
}

/** Parse and coerce the JSON request body. */
export function parseBody<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
}

/** Parse only the query string. */
export function parseQuery<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
}

/** Parse only the route params. */
export function parseParams<T>(req: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(req.params ?? {});
  if (!result.success) throw validationError(result.error.issues);
  return result.data;
}

function validationError(issues: ZodIssue[]): HttpError {
  return new HttpError(
    400,
    'Please check the highlighted fields.',
    'validation_error',
    issues.map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    })),
  );
}

/** Shared UUID param schema for :id style routes. */
export const uuidParam = z.string().uuid('That identifier is not valid.');

/** Rate limiter for credential endpoints (signup/login/reset). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { message: 'Too many attempts. Please wait a few minutes.', code: 'rate_limited' },
  },
});

/** Build a URL-safe slug from a title. */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

  return base || 'untitled';
}

/** Append `-2`, `-3`, … until the slug is free. */
export async function uniqueSlug(
  desired: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(desired);
  let candidate = base;
  let suffix = 2;

  while (await isTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

/** Normalise an email for storage/lookup. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Safe integer parse with fallback. */
export function toInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Initials for avatars/chat ("Riya Sharma" → "RS"). */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}