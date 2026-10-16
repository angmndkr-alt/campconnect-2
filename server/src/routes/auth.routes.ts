import { Router, type Request } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { authLimiter, parseBody } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import * as auth from '../services/auth.service.js';

export const authRouter = Router();

const sessionMeta = (req: Request) => ({
  userAgent: req.headers['user-agent'] ?? undefined,
  ip: req.ip ?? undefined,
});

const institutionalEmailDomain = '@pvppcoe.ac.in';
const signupEmailField = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .email('Enter a valid email address.')
  .refine(
    (e) => e.toLowerCase().endsWith(institutionalEmailDomain),
    'Only institutional email addresses ending in @pvppcoe.ac.in are allowed.',
  );

const loginEmailField = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .email('Enter a valid email address.')
  .refine(
    (e) => e.toLowerCase().endsWith(institutionalEmailDomain) || e.toLowerCase().endsWith('@campus.edu'),
    'Only institutional email addresses ending in @pvppcoe.ac.in are allowed.',
  );

const passwordField = z.string().min(8, 'Password must be at least 8 characters.').max(200);

const signupSchema = z.object({
  email: signupEmailField,
  password: passwordField,
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  department: z.string().trim().max(120).optional(),
  yearOrDesignation: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: loginEmailField,
  password: z.string().min(1, 'Enter your password.'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(10) });
const resetRequestSchema = z.object({ email: loginEmailField });
const resetSchema = z.object({ token: z.string().min(10), newPassword: passwordField });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.'),
  newPassword: passwordField,
});

const firstLoginSchema = z.object({ newPassword: passwordField });

const updateMeSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  department: z.string().trim().max(120).optional(),
  yearOrDesignation: z.string().trim().max(120).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
});

/** POST /api/auth/signup — student self-registration. */
authRouter.post(
  '/signup',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, signupSchema);
    const profile = await auth.signup(body);
    const session = await auth.issueSession(profile, sessionMeta(req));

    res.status(201).json({ profile, ...session });
  }),
);

/** POST /api/auth/login — student sign-in. */
authRouter.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, loginSchema);
    const result = await auth.login({ ...body, expectRole: 'student', meta: sessionMeta(req) });

    res.json({
      profile: result.profile,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

/** POST /api/auth/admin/login — club-admin sign-in (super admins also allowed). */
authRouter.post(
  '/admin/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, loginSchema);
    const result = await auth.login({ ...body, expectRole: 'club_admin', meta: sessionMeta(req) });

    res.json({
      profile: result.profile,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

/** POST /api/auth/refresh — rotate the refresh token. */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const body = parseBody(req, refreshSchema);
    const result = await auth.refreshSession(body.refreshToken, sessionMeta(req));

    res.json({
      profile: result.profile,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }),
);

/** POST /api/auth/logout — revoke the presented refresh token. */
authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { refreshToken?: string };
    await auth.logout(body.refreshToken);
    res.json({ ok: true });
  }),
);

/** GET /api/auth/session — current profile for the bearer token. */
authRouter.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const profile = await auth.findProfileById(req.user!.id);
    if (!profile) {
      res.status(401).json({ error: { message: 'Account not found.', code: 'unauthorized' } });
      return;
    }
    const { password_hash: _h, is_active: _a, ...publicProfile } = profile;
    res.json({ profile: publicProfile });
  }),
);

/** PATCH /api/auth/me — update the signed-in profile. */
authRouter.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, updateMeSchema);
    const profile = await auth.updateOwnProfile({ userId: req.user!.id, ...body });
    res.json({ profile });
  }),
);

/** POST /api/auth/change-password — requires the current password. */
authRouter.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, changePasswordSchema);
    await auth.changePassword({ userId: req.user!.id, ...body });
    res.json({ ok: true, message: 'Password updated. Please sign in again.' });
  }),
);

/** POST /api/auth/first-login-password — forced first-login change (admins). */
authRouter.post(
  '/first-login-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, firstLoginSchema);
    await auth.completeFirstLoginPassword({ userId: req.user!.id, newPassword: body.newPassword });
    res.json({ ok: true, message: 'Password saved. Please sign in again.' });
  }),
);

/** POST /api/auth/forgot-password — always succeeds (no account enumeration). */
authRouter.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, resetRequestSchema);
    const { token, expiresAt } = await auth.requestPasswordReset(body.email);

    // No mail provider is wired up yet, so in development the token is
    // returned to make the reset flow usable end-to-end. Never do this in prod.
    const payload: Record<string, unknown> = {
      ok: true,
      message: 'If that email is registered, a reset link has been created.',
    };

    if (!env.isProd && token) {
      payload.devResetToken = token;
      payload.expiresAt = expiresAt;
      payload.resetUrl = `/reset-password?token=${token}`;
    }

    res.json(payload);
  }),
);

/** POST /api/auth/reset-password — consume a reset token. */
authRouter.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, resetSchema);
    await auth.resetPassword(body);
    res.json({ ok: true, message: 'Password updated. You can sign in now.' });
  }),
);