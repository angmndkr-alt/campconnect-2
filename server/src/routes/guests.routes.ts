import { Router } from 'express';
import { z } from 'zod';
import { one } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { assertEventAccess } from '../middleware/rbac.js';
import { parseBody, parseParams, parseQuery, uuidParam } from '../lib/http.js';
import * as guests from '../services/guests.service.js';

export const guestsRouter = Router();

const idParam = z.object({ id: uuidParam });
const guestParam = z.object({ id: uuidParam });

const answerSchema = z.object({
  questionId: z.string().min(1),
  answer: z.string().max(2000).default(''),
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name.').max(120),
  email: z.string().trim().min(3).max(320).email('Enter a valid email address.'),
  phone: z.string().trim().max(30).optional(),
  department: z.string().trim().max(120).optional(),
  year: z.string().trim().max(60).optional(),
  ticketTypeId: z.string().optional(),
  answers: z.array(answerSchema).max(50).optional(),
});

const statusSchema = z.object({
  status: z.enum(['invited', 'pending_approval', 'approved', 'waitlist', 'declined']),
  note: z.string().trim().max(500).optional(),
});

const listSchema = z.object({
  status: z
    .enum(['all', 'approved', 'pending_approval', 'waitlist', 'invited', 'declined',
           'checked_in', 'not_checked_in'])
    .optional(),
  search: z.string().optional(),
  sort: z.enum(['registered_at', 'full_name', 'checked_in_at']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const bulkSchema = z.object({
  emails: z
    .array(z.string().trim().max(320))
    .min(1, 'Add at least one email.')
    .max(2000),
  status: z.enum(['invited', 'pending_approval', 'approved', 'waitlist', 'declined']),
  note: z.string().trim().max(500).optional(),
});

/**
 * POST /api/events/:id/registrations — public registration (Luma's register).
 * Works signed-in or not; when signed in the registration is linked to the profile.
 */
guestsRouter.post(
  '/:id/registrations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, registerSchema);

    const guest = await guests.registerForEvent({
      eventId: id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      department: body.department,
      year: body.year,
      ticketTypeId: body.ticketTypeId,
      profileId: req.user?.id,
      answers: body.answers,
    });

    res.status(201).json({ guest, ticketUrl: `/e/${id}` });
  }),
);

/** GET /api/events/:id/registrations/me — the caller's own registration. */
guestsRouter.get(
  '/:id/registrations/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);

    const identity = {
      profileId: req.user?.id,
      email: undefined,
    };

    if (!identity.profileId && !identity.email) {
      res.json({ guest: null });
      return;
    }

    const guest = await guests.findMyRegistration(id, identity);
    res.json({ guest });
  }),
);

/** DELETE /api/events/:eventId/registrations/:guestId — cancel your own registration. */
guestsRouter.delete(
  '/:id/registrations/:guestId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseParams(req, z.object({ id: uuidParam, guestId: uuidParam }));
    const registration=await one<{event_id:string}>('SELECT event_id FROM guests WHERE id=$1',[params.guestId]);
    if(registration?.event_id!==params.id)throw notFound('Registration not found.');
    const guest = await guests.cancelRegistration(params.guestId, req.user!.id);
    res.json({ guest });
  }),
);

/** GET /api/events/:id/guests — manage-page guest list. */
guestsRouter.get(
  '/:id/guests',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'checkin_staff');

    const q = parseQuery(req, listSchema);
    const result = await guests.listGuests({ eventId: id, ...q });
    res.json(result);
  }),
);

/** GET /api/events/:id/guests.csv — CSV export. */
guestsRouter.get(
  '/:id/guests.csv',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'manager');

    const csv = await guests.guestsCsv(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="guests-${id}.csv"`);
    res.send(csv);
  }),
);

/** PATCH /api/events/:eventId/guests/:guestId/status — approve / decline / waitlist. */
guestsRouter.patch(
  '/:id/guests/:guestId/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseParams(req, z.object({ id: uuidParam, guestId: uuidParam }));
    const body = parseBody(req, statusSchema);

    await assertEventAccess(req, params.id, 'manager');

    const target=await one<{event_id:string}>('SELECT event_id FROM guests WHERE id=$1',[params.guestId]);
    if(target?.event_id!==params.id)throw notFound('Guest not found for this event.');
    const guest = await guests.setGuestStatus({ guestId: params.guestId, ...body });
    res.json({ guest });
  }),
);

/** POST /api/events/:id/guests/bulk — bulk status update by email list. */
guestsRouter.post(
  '/:id/guests/bulk',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'manager');
    const body = parseBody(req, bulkSchema);

    const result = await guests.bulkSetStatus({ eventId: id, ...body });
    res.json(result);
  }),
);

/** POST /api/events/:id/guests/bulk-resolve — approve/decline every pending guest. */
guestsRouter.post(
  '/:id/guests/bulk-resolve',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'manager');

    const body = parseBody(req, z.object({ approve: z.boolean() }));
    const updated = await guests.bulkResolvePending({ eventId: id, approve: body.approve });

    res.json({ updated });
  }),
);

/**
 * POST /api/events/:id/check-ins — check a guest in by QR token or guest id.
 * Requires `checkin_staff` or higher.
 */
guestsRouter.post(
  '/:id/check-ins',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'checkin_staff');

    const body = parseBody(
      req,
      z.object({
        qrToken: z.string().trim().min(6).optional(),
        guestId: z.string().uuid().optional(),
        method: z.enum(['qr_scan', 'manual', 'self']).default('qr_scan'),
      }),
    );

    if (!body.qrToken && !body.guestId) {
      res.status(400).json({
        error: { message: 'Provide a scanned QR token or a guest id.', code: 'bad_request' },
      });
      return;
    }

    const result = await guests.checkIn({
      eventId: id,
      qrToken: body.qrToken,
      guestId: body.guestId,
      method: body.method,
      checkedInBy: req.user!.id,
    });

    res.status(result.alreadyCheckedIn ? 200 : 201).json(result);
  }),
);

/** DELETE /api/events/:id/check-ins/:guestId — undo a check-in. */
guestsRouter.delete(
  '/:id/check-ins/:guestId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = parseParams(
      req,
      z.object({ id: uuidParam, guestId: uuidParam }),
    );
    await assertEventAccess(req, params.id, 'checkin_staff');

    const guest = await guests.undoCheckIn({
      eventId: params.id,
      guestId: params.guestId,
    });

    res.json({ guest });
  }),
);
