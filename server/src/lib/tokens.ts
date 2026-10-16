import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env.js';
import type { AppRole } from '../types.js';

export type AccessTokenPayload = {
  sub: string;
  email: string;
  role: AppRole;
};

/** Short-lived access token (Bearer header). */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'campconnect',
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: 'campconnect' });
    if (typeof decoded === 'string') return null;
    const { sub, email, role } = decoded as jwt.JwtPayload & Partial<AccessTokenPayload>;
    if (!sub || !email || !role) return null;
    return { sub, email, role };
  } catch {
    return null;
  }
}

/** Opaque refresh token — only its SHA-256 hash is stored in the database. */
export function createRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(48).toString('base64url');
  return { token, hash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function refreshExpiry(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Token for the check-in QR payload — opaque, non-guessable. */
export function createQrToken(): string {
  return randomBytes(24).toString('base64url');
}