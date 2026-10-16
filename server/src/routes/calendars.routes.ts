import { Router } from 'express';
import { z } from 'zod';
import { one, query, rows } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { parseBody, parseParams, uuidParam } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCalendarRole } from '../middleware/rbac.js';
import { asyncHandler } from '../middleware/error.js';
import * as calendars from '../services/calendars.service.js';

export const calendarsRouter = Router();
export const adminRouter = Router();

const idParam = z.object({ id: z.string().min(1) });

/** GET /api/calendars — every club. */
calendarsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({ calendars: await calendars.listCalendars() });
  }),
);

/** GET /api/calendars/:id — one club plus its events and admins. */
calendarsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const calendar = await calendars.getCalendar(id);
    if (!calendar) throw notFound('That club does not exist.');

    const [events, admins] = await Promise.all([
      rows(`SELECT * FROM events
              WHERE calendar_id = $1 AND is_published = true
              ORDER BY date ASC`, [calendar.id]),
      calendars.listCalendarAdmins(calendar.id),
    ]);

    res.json({ calendar, events, admins });
  }),
);

/** GET /api/calendars/:id/admins — club admin roster. */
calendarsRouter.get(
  '/:id/admins',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertCalendarRole(req, id, 'admin');
    res.json({ admins: await calendars.listCalendarAdmins(id) });
  }),
);

const addAdminSchema = z.object({
  profileId: z.string().uuid('Pick an account.'),
  role: z.enum(['owner', 'admin', 'manager', 'checkin_staff']).default('admin'),
});

/** POST /api/calendars/:id/admins — grant a role on a club. */
calendarsRouter.post(
  '/:id/admins',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertCalendarRole(req, id, 'admin');

    const body = parseBody(req, addAdminSchema);
    await calendars.addCalendarAdmin({ calendarId: id, ...body });

    res.status(201).json({ admins: await calendars.listCalendarAdmins(id) });
  }),
);

/** DELETE /api/calendars/:id/admins/:profileId */
calendarsRouter.delete(
  '/:id/admins/:profileId',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const params = parseParams(
      req,
      z.object({ id: z.string().min(1), profileId: z.string().uuid() }),
    );
    await assertCalendarRole(req, params.id, 'admin');

    await calendars.removeCalendarAdmin(params.id, params.profileId);
    res.json({ admins: await calendars.listCalendarAdmins(params.id) });
  }),
);

/** GET /api/me/follows — clubs the caller follows. */
calendarsRouter.get(
  '/me/follows',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ follows: await calendars.listFollowing(req.user!.id) });
  }),
);

/** POST /api/calendars/:id/follow — toggle a follow. */
calendarsRouter.post(
  '/:id/follow',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const following = await calendars.toggleFollow(req.user!.id, id);
    res.json({ following });
  }),
);