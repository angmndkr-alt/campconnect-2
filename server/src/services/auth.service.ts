import { one, query, rows, tx } from '../db/pool.js';
import { badRequest, conflict, notFound, unauthorized } from '../lib/errors.js';
import { normaliseEmail } from '../lib/http.js';
import { hashPassword, passwordProblem, verifyPassword } from '../lib/password.js';
import { createRefreshToken, refreshExpiry, sha256, signAccessToken } from '../lib/tokens.js';
import { PUBLIC_PROFILE_COLUMNS, type AppRole } from '../types.js';

export type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  department: string | null;
  year_or_designation: string | null;
  role: AppRole;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
};

export type SessionMeta = { userAgent?: string; ip?: string };

type AccountRow = ProfileRow & { password_hash: string; is_active: boolean };

const findProfileForAuth = async (email: string): Promise<AccountRow | null> => {
  const row = await one<AccountRow>(
    `SELECT ${PUBLIC_PROFILE_COLUMNS}, password_hash, is_active
       FROM profiles WHERE lower(email) = lower($1)`,
    [email],
  );
  if (row) return row;

  if (email.toLowerCase().endsWith('@pvppcoe.ac.in')) {
    const legacyEmail = email.toLowerCase().replace(/@pvppcoe\.ac\.in$/i, '@campus.edu');
    return one<AccountRow>(
      `SELECT ${PUBLIC_PROFILE_COLUMNS}, password_hash, is_active
         FROM profiles WHERE lower(email) = lower($1)`,
      [legacyEmail],
    );
  }

  return null;
};

const findProfileById = async (id: string): Promise<AccountRow | null> =>
  one<AccountRow>(
    `SELECT ${PUBLIC_PROFILE_COLUMNS}, password_hash, is_active
       FROM profiles WHERE id = $1`,
    [id],
  );

/** Create a revocable session and return the token pair. */
export async function issueSession(
  profile: ProfileRow,
  meta: SessionMeta = {},
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string }> {
  const { token, hash } = createRefreshToken();
  const expiresAt = refreshExpiry();

  await query(
    `INSERT INTO sessions (user_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [profile.id, hash, meta.userAgent ?? null, meta.ip ?? null, expiresAt],
  );

  const accessToken = signAccessToken({
    sub: profile.id,
    email: profile.email,
    role: profile.role,
  });

  return { accessToken, refreshToken: token, expiresAt: expiresAt.toISOString() };
}

export { findProfileById, findProfileForAuth };

export async function signup(input: {
  email: string;
  password: string;
  fullName: string;
  department?: string;
  yearOrDesignation?: string;
}): Promise<ProfileRow> {
  const email = normaliseEmail(input.email);
  const problem = passwordProblem(input.password);
  if (problem) throw badRequest(problem);

  const existing = await findProfileForAuth(email);
  if (existing) throw conflict('An account with that email already exists.');

  const passwordHash = await hashPassword(input.password);

  // Self-signup always creates a student; only a super admin mints other roles.
  const row = await one<ProfileRow>(
    `INSERT INTO profiles (email, password_hash, full_name, department, year_or_designation, role)
     VALUES ($1, $2, $3, $4, $5, 'student')
     RETURNING ${PUBLIC_PROFILE_COLUMNS}`,
    [email, passwordHash, input.fullName, input.department ?? null, input.yearOrDesignation ?? null],
  );

  if (!row) throw new Error('Failed to create account.');
  return row;
}

export async function login(input: {
  email: string;
  password: string;
  /** When set, the account must hold this role (used by the admin sign-in). */
  expectRole?: AppRole;
  meta?: SessionMeta;
}): Promise<{ profile: ProfileRow; accessToken: string; refreshToken: string }> {
  const account = await findProfileForAuth(normaliseEmail(input.email));

  // Uniform error so we never reveal which half was wrong.
  if (!account || !account.is_active) {
    throw unauthorized('Email or password is incorrect.');
  }

  const ok = await verifyPassword(input.password, account.password_hash);
  if (!ok) throw unauthorized('Email or password is incorrect.');

  if (input.expectRole && account.role !== input.expectRole && account.role !== 'super_admin') {
    throw unauthorized(
      input.expectRole === 'club_admin'
        ? 'This sign-in is for club admins only.'
        : 'This sign-in is for students only.',
    );
  }

  await query('UPDATE profiles SET last_login_at = now() WHERE id = $1', [account.id]);

  const { password_hash: _hash, is_active: _active, ...profile } = account;
  const session = await issueSession(profile, input.meta);

  return { profile, ...session };
}

/** Exchange a refresh token for a fresh pair (with rotation). */
export async function refreshSession(
  refreshToken: string,
  meta: SessionMeta = {},
): Promise<{ profile: ProfileRow; accessToken: string; refreshToken: string }> {
  const session = await one<{ id: string; user_id: string; expires_at: string }>(
    `SELECT id, user_id, expires_at FROM sessions
      WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
    [sha256(refreshToken)],
  );

  if (!session || new Date(session.expires_at).getTime() < Date.now()) {
    throw unauthorized('Your session has expired. Please sign in again.');
  }

  const account = await findProfileById(session.user_id);
  if (!account || !account.is_active) throw unauthorized('Account is no longer active.');

  const { password_hash: _hash, is_active: _active, ...profile } = account;

  await query('UPDATE sessions SET revoked_at = now() WHERE id = $1', [session.id]);
  const next = await issueSession(profile, meta);

  return { profile, ...next };
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  await query('UPDATE sessions SET revoked_at = now() WHERE refresh_token_hash = $1', [
    sha256(refreshToken),
  ]);
}

/** Revoke every session for a user (used after password changes). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await query(
    'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const account = await findProfileById(input.userId);
  if (!account) throw notFound('Account not found.');

  const ok = await verifyPassword(input.currentPassword, account.password_hash);
  if (!ok) throw badRequest('Current password is incorrect.');

  const problem = passwordProblem(input.newPassword);
  if (problem) throw badRequest(problem);

  if (input.currentPassword === input.newPassword) {
    throw badRequest('Choose a password you have not used before.');
  }

  const hash = await hashPassword(input.newPassword);
  await query(
    `UPDATE profiles
        SET password_hash = $2, must_change_password = false, updated_at = now()
      WHERE id = $1`,
    [input.userId, hash],
  );
}

/** Complete the forced first-login change (no current password required). */
export async function completeFirstLoginPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<void> {
  const account = await findProfileById(input.userId);
  if (!account) throw notFound('Account not found.');

  if (!account.must_change_password) {
    throw badRequest('This account has already completed its first-login setup.');
  }

  const problem = passwordProblem(input.newPassword);
  if (problem) throw badRequest(problem);

  const hash = await hashPassword(input.newPassword);
  await query(
    `UPDATE profiles
        SET password_hash = $2, must_change_password = false, updated_at = now()
      WHERE id = $1`,
    [input.userId, hash],
  );
  // Sessions are intentionally kept alive so the user lands in their workspace
  // straight after the first-login setup instead of being bounced to sign-in.
}

/**
 * Create a password-reset token. In development the token is returned so the
 * UI can display/continue the flow; swap in an email provider for production.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ token: string | null; expiresAt: string | null }> {
  const account = await findProfileForAuth(normaliseEmail(email));

  // Always succeed so the endpoint can't be used to enumerate accounts.
  if (!account) return { token: null, expiresAt: null };

  const { token, hash } = createRefreshToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [account.id, hash, expiresAt],
  );

  return { token, expiresAt: expiresAt.toISOString() };
}

export async function resetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<void> {
  const problem = passwordProblem(input.newPassword);
  if (problem) throw badRequest(problem);

  const row = await one<{ id: string; user_id: string; expires_at: string; used_at: string | null }>(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1',
    [sha256(input.token)],
  );

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    throw badRequest('That reset link is invalid or has expired.');
  }

  const hash = await hashPassword(input.newPassword);

  await tx(async (client) => {
    await client.query(
      `UPDATE profiles
          SET password_hash = $2, must_change_password = false, updated_at = now()
        WHERE id = $1`,
      [row.user_id, hash],
    );
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
await client.query(
      'UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [row.user_id],
    );
  });
}
    /** Admin-created accounts (super admin only). */
export async function adminCreateUser(input: {
  email: string;
  fullName: string;
  password: string;
  role: AppRole;
  department?: string;
  yearOrDesignation?: string;
  calendarIds?: string[];
}): Promise<ProfileRow> {
  const email = normaliseEmail(input.email);
  const problem = passwordProblem(input.password);
  if (problem) throw badRequest(problem);

  const existing = await findProfileForAuth(email);
  if (existing) throw conflict('An account with that email already exists.');

  const hash = await hashPassword(input.password);

  return tx(async (client) => {
    const inserted = await client.query<ProfileRow>(
      `INSERT INTO profiles
         (email, password_hash, full_name, department, year_or_designation, role, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING ${PUBLIC_PROFILE_COLUMNS}`,
      [
        email,
        hash,
        input.fullName,
        input.department ?? null,
        input.yearOrDesignation ?? null,
        input.role,
      ],
    );

    const profile = inserted.rows[0];
    if (!profile) throw new Error('Failed to create user.');

    const membershipRole = input.role === 'checkin_staff' ? 'checkin_staff' : 'admin';

    for (const calendarId of input.calendarIds ?? []) {
      await client.query(
        `INSERT INTO calendar_admins (calendar_id, profile_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (calendar_id, profile_id) DO UPDATE SET role = EXCLUDED.role`,
        [calendarId, profile.id, membershipRole],
      );
    }

    return profile;
  });
}

export async function listProfiles(): Promise<Array<ProfileRow & { calendars: string[] }>> {
  const profiles = await rows<ProfileRow>(
    `SELECT ${PUBLIC_PROFILE_COLUMNS} FROM profiles ORDER BY created_at DESC`,
  );

  const memberships = await rows<{ profile_id: string; calendar_id: string }>(
    'SELECT profile_id, calendar_id FROM calendar_admins',
  );

  const byProfile = new Map<string, string[]>();
  for (const m of memberships) {
    byProfile.set(m.profile_id, [...(byProfile.get(m.profile_id) ?? []), m.calendar_id]);
  }

  return profiles.map((p) => ({ ...p, calendars: byProfile.get(p.id) ?? [] }));
}

export async function setProfileRole(userId: string, role: AppRole): Promise<ProfileRow> {
  const row = await one<ProfileRow>(
    `UPDATE profiles SET role = $2, updated_at = now()
      WHERE id = $1 RETURNING ${PUBLIC_PROFILE_COLUMNS}`,
    [userId, role],
  );
  if (!row) throw notFound('Account not found.');
  return row;
}

export async function setProfileActive(userId: string, isActive: boolean): Promise<ProfileRow> {
  const row = await one<ProfileRow>(
    `UPDATE profiles SET is_active = $2, updated_at = now()
      WHERE id = $1 RETURNING ${PUBLIC_PROFILE_COLUMNS}`,
    [userId, isActive],
  );
  if (!row) throw notFound('Account not found.');

  if (!isActive) await revokeAllSessions(userId);
  return row;
}

export async function updateOwnProfile(input: {
  userId: string;
  fullName?: string;
  department?: string;
  yearOrDesignation?: string;
  avatarUrl?: string;
}): Promise<ProfileRow> {
  const row = await one<ProfileRow>(
    `UPDATE profiles
        SET full_name           = COALESCE($2, full_name),
            department          = COALESCE($3, department),
            year_or_designation = COALESCE($4, year_or_designation),
            avatar_url          = COALESCE($5, avatar_url),
            updated_at          = now()
      WHERE id = $1
      RETURNING ${PUBLIC_PROFILE_COLUMNS}`,
    [
      input.userId,
      input.fullName ?? null,
      input.department ?? null,
      input.yearOrDesignation ?? null,
      input.avatarUrl ?? null,
    ],
  );

  if (!row) throw notFound('Account not found.');
  return row;
}