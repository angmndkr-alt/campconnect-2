import { Router } from 'express';
import { z } from 'zod';
import { one, query, rows } from '../db/pool.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { authLimiter, parseBody, parseParams, uuidParam } from '../lib/http.js';
import { hashPassword, passwordProblem } from '../lib/password.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCalendarRole, assertEventAccess } from '../middleware/rbac.js';
import { asyncHandler } from '../middleware/error.js';
import * as auth from '../services/auth.service.js';

export const adminRouter = Router();

const idParam = z.object({ id: uuidParam });

/** GET /api/admin/users — platform accounts (super admin only). */
adminRouter.get(
  '/users',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(async (_req, res) => {
    res.json({ users: await auth.listProfiles() });
  }),
);

const createUserSchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .email('Enter a valid email address.')
    .refine(
      (e) => e.toLowerCase().endsWith('@pvppcoe.ac.in'),
      'Only institutional email addresses ending in @pvppcoe.ac.in are allowed.',
    ),
  fullName: z.string().trim().min(2, 'Enter a full name.').max(120),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
  role: z.enum(['student', 'club_admin', 'checkin_staff', 'super_admin']),
  department: z.string().trim().max(120).optional(),
  yearOrDesignation: z.string().trim().max(120).optional(),
  calendarIds: z.array(z.string().min(1)).max(20).optional(),
});

/** POST /api/admin/users — create an account (the admin-creation flow). */
adminRouter.post(
  '/users',
  requireAuth,
  requireRole('super_admin'),
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createUserSchema);
    const profile = await auth.adminCreateUser(body);
    res.status(201).json({ profile });
  }),
);

/** PATCH /api/admin/users/:id/role */
adminRouter.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const body = parseBody(
      req,
      z.object({ role: z.enum(['student', 'club_admin', 'checkin_staff', 'super_admin']) }),
    );

    if (id === req.user!.id && body.role !== 'super_admin') {
      throw forbidden('You cannot remove your own super admin role.');
    }

    res.json({ profile: await auth.setProfileRole(id, body.role) });
  }),
);

/** PATCH /api/admin/users/:id/active — suspend/restore an account. */
adminRouter.patch(
  '/users/:id/active',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, z.object({ isActive: z.boolean() }));

    if (id === req.user!.id && !body.isActive) {
      throw forbidden('You cannot suspend your own account.');
    }

    res.json({ profile: await auth.setProfileActive(id, body.isActive) });
  }),
);

/** POST /api/admin/users/:id/temp-password — reset someone's password. */
adminRouter.post(
  '/users/:id/temp-password',
  requireAuth,
  requireRole('super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const body = parseBody(
      req,
      z.object({ password: z.string().max(200) }),
    );

    const problem = passwordProblem(body.password);
    if (problem) throw badRequest(problem);

    const profile = await one<{ id: string }>('SELECT id FROM profiles WHERE id = $1', [id]);
    if (!profile) throw notFound('That account does not exist.');

    // Force a change on next sign-in, exactly like a first-login password.
    const hash = await hashPassword(body.password);
    await query(
      `UPDATE profiles
          SET password_hash = $2, must_change_password = true, updated_at = now()
        WHERE id = $1`,
      [id, hash],
    );
    await auth.revokeAllSessions(id);

    res.json({ ok: true, message: 'Temporary password set. It must be changed on sign-in.' });
  }),
);

const blastSchema = z.object({
  subject: z.string().trim().min(2, 'Add a subject.').max(200),
  messageBody: z.string().trim().min(2, 'Write your message.').max(4000),
  audience: z.enum(['all', 'attendees', 'waitlist', 'not_going']).default('all'),
});

/** POST /api/admin/events/:id/blasts — message the guest list. */
adminRouter.post(
  '/events/:id/blasts',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const { calendarId } = await assertEventAccess(req, id, 'manager');
    const body = parseBody(req, blastSchema);

    const audienceFilter: Record<string, string> = {
      all: `status IN ('approved','pending_approval','invited','waitlist')`,
      attendees: `status = 'approved'`,
      waitlist: `status = 'waitlist'`,
      not_going: `status = 'declined'`,
    };

    const count = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM guests
        WHERE event_id = $1 AND is_invalidated = false
          AND ${audienceFilter[body.audience]}`,
      [id],
    );

    const blast = await one(
      `INSERT INTO blasts (event_id, calendar_id, sender_id, subject, message_body,
                           audience, recipient_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, calendarId, req.user!.id, body.subject, body.messageBody, body.audience, count?.n ?? 0],
    );

    res.status(201).json({ blast, recipients: count?.n ?? 0 });
  }),
);

/** GET /api/admin/events/:id/blasts — sent-message history. */
adminRouter.get(
  '/events/:id/blasts',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'manager');

    const list = await rows(
      'SELECT * FROM blasts WHERE event_id = $1 ORDER BY sent_at DESC',
      [id],
    );
    res.json({ blasts: list });
  }),
);

const announcementSchema = z.object({
  title: z.string().trim().min(2, 'Add a title.').max(200),
  body: z.string().trim().min(2, 'Write the notice.').max(2000),
  tone: z.enum(['mint', 'amber', 'purple', 'coral']).default('mint'),
  audience: z.string().trim().max(80).default('All students'),
  calendarId: z.string().optional(),
});

/** POST /api/admin/announcements — campus-wide student notification. */
adminRouter.post(
  '/announcements',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, announcementSchema);

    if (body.calendarId) {
      await assertCalendarRole(req, body.calendarId, 'admin');
    }

    const row = await one(
      `INSERT INTO announcements (title, body, tone, audience, calendar_id, sender_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [body.title, body.body, body.tone, body.audience, body.calendarId ?? null, req.user!.id],
    );

    res.status(201).json({ announcement: row });
  }),
);