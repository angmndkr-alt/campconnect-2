import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;
const SALT_LEN = 16;

/**
 * Hash a password with scrypt (Node built-in — no native build step needed).
 * Format: scrypt$<saltHex>$<keyHex>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

/** Constant-time password check. Never throws on malformed stored hashes. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, saltHex, keyHex] = stored.split('$');
    if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;

    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(keyHex, 'hex');
    const actual = await scrypt(password, salt, expected.length);

    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** Minimum policy shared by signup, reset and change-password. */
export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (password.length > 200) return 'Password is too long.';
  return null;
}