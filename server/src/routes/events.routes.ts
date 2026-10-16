import { Router } from 'express';
import { z } from 'zod';
import { one, query, rows, tx } from '../db/pool.js';
import { badRequest, notFound } from '../lib/errors.js';
import { parseBody, parseParams, parseQuery, uuidParam } from '../lib/http.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertCalendarRole, assertEventAccess } from '../middleware/rbac.js';
import { asyncHandler } from '../middleware/error.js';
import * as events from '../services/events.service.js';

export const eventsRouter = Router();

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const listQuerySchema = z.object({
  calendarId: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
  range: z.enum(['upcoming', 'past', 'all']).optional(),
  includeUnpublished: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const configurationSchema=z.object({tickets:z.array(z.object({id:z.string(),name:z.string().trim().min(1).max(120),price:z.number().min(0),ticket_kind:z.enum(['free','approval'])})),questions:z.array(z.object({id:z.union([z.string(),z.number()]),label:z.string().trim().min(2).max(500),required:z.boolean()}))});

const createEventSchema = z.object({
  tickets: configurationSchema.shape.tickets.optional(),
  questions: configurationSchema.shape.questions.optional(),
  calendarId: z.string().min(1, 'Pick a club.'),
  title: z.string().trim().min(3, 'Give the event a title (3+ characters).').max(160),
  category: z.string().trim().max(60).optional(),
  description: z.string().trim().max(4000).optional(),
  eventType: z.enum(['in_person', 'online', 'hybrid']).optional(),
  visibility: z.enum(['public', 'private', 'member_only']).optional(),
  date: z.string().regex(datePattern, 'Use the date picker.'),
  endDate: z.string().regex(datePattern).nullable().optional(),
  time: z.string().min(1, 'Add a start time.'),
  endTime: z.string().nullable().optional(),
  timezone: z.string().max(64).optional(),
  venue: z.string().trim().max(200).optional(),
  onlineUrl: z.string().trim().max(500).nullable().optional(),
  xp: z.coerce.number().int().min(0).max(1000).optional(),
  tone: z.enum(['mint', 'amber', 'purple', 'coral']).optional(),
  coverUrl: z.string().trim().max(500).nullable().optional(),
  maxCapacity: z.coerce.number().int().min(1).nullable().optional(),
  requiresApproval: z.boolean().optional(),
  waitlistEnabled: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

const updateEventSchema = createEventSchema.partial();

const idParam = z.object({ id: uuidParam });

/** GET /api/events — public list with filters. */
eventsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const query_ = parseQuery(req, listQuerySchema);
    const list = await events.listEvents(query_);
    res.json({ events: list });
  }),
);

/** GET /api/events/:idOrSlug — public event page payload. */
eventsRouter.get(
  '/:idOrSlug',
  asyncHandler(async (req, res) => {
    const key = String(req.params.idOrSlug ?? '');
    const event = uuidParam.safeParse(key).success
      ? await events.getEventById(key)
      : await events.getEventBySlug(key);

    if (!event) throw notFound('That event does not exist.');

    const [calendar, hosts, config, stats] = await Promise.all([
      one('SELECT * FROM calendars WHERE id = $1', [event.calendar_id]),
      rows('SELECT name, role, avatar_url FROM event_hosts WHERE event_id = $1 ORDER BY name', [
        event.id,
      ]),
      events.getRegistrationConfig(event.id),
      one('SELECT * FROM event_guest_stats WHERE event_id = $1', [event.id]),
    ]);

    res.json({ event, calendar, hosts, stats, ...config });
  }),
);

/**
 * POST /api/events — create an event.
 * The caller must be a manager+ of the calendar they are posting to
 * (super admins pass for any calendar).
 */
eventsRouter.post(
  '/',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createEventSchema);
    // The caller must be a manager+ on the target calendar.
    await assertCalendarRole(req, body.calendarId, 'manager');

    const event = await events.createEvent(req.user!.id, body);
    res.status(201).json({ event });
  }),
);

/** PATCH /api/events/:id — update an event. */
eventsRouter.patch(
  '/:id',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, updateEventSchema);
    const { calendarId: _c, ...patch } = body;

    const event = await events.getEventById(id);
    if (!event) throw notFound('That event does not exist.');
    await assertEventAccess(req, event.id, 'manager');

    const updated = await events.updateEvent(id, patch, req.user!.id);
    res.json({ event: updated });
  }),
);

/** DELETE /api/events/:id */
eventsRouter.delete(
  '/:id',
  requireAuth,
  requireRole('club_admin', 'super_admin'),
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const event = await events.getEventById(id);
    if (!event) throw notFound('That event does not exist.');
    await assertEventAccess(req, event.id, 'manager');

    await events.deleteEvent(id, req.user!.id);
    res.json({ ok: true });
  }),
);

/** GET /api/events/:id/manage — manage-page payload (event + stats + config). */
eventsRouter.get(
  '/:id/manage',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'checkin_staff');
    res.json({ event: await events.getManagedEvent(id) });
  }),
);

/** GET /api/events/:id/overview — dashboard rollup for one event. */
eventsRouter.get(
  '/:id/overview',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'checkin_staff');

    const [event, stats, recent] = await Promise.all([
      events.getEventById(id),
      one('SELECT * FROM event_guest_stats WHERE event_id = $1', [id]),
      rows(
        `SELECT id, full_name, email, status, checked_in_at, registered_at
           FROM guests WHERE event_id = $1 AND is_invalidated = false
          ORDER BY registered_at DESC LIMIT 8`,
        [id],
      ),
    ]);

    res.json({ event, stats, recent });
  }),
);

const ticketSchema = z.object({
  name: z.string().trim().min(1, 'Name the ticket type.').max(120),
  description: z.string().trim().max(500).nullable().optional(),
  paymentType: z.enum(['free', 'paid']).optional(),
  priceCents: z.coerce.number().int().min(0).optional(),
  currency: z.string().max(8).optional(),
  capacity: z.coerce.number().int().min(1).nullable().optional(),
  maxPerOrder: z.coerce.number().int().min(1).max(20).optional(),
  requiresApproval: z.boolean().optional(),
  isHidden: z.boolean().optional(),
  salesStart: z.string().nullable().optional(),
  salesEnd: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

/** POST /api/events/:id/ticket-types */
eventsRouter.post(
  '/:id/ticket-types',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'manager');
    const body = parseBody(req, ticketSchema);

    const created = await one(
      `INSERT INTO ticket_types (event_id, name, description, payment_type, price_cents,
                                 currency, capacity, max_per_order, requires_approval,
                                 is_hidden, sales_start, sales_end, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        id,
        body.name,
        body.description ?? null,
        body.paymentType ?? 'free',
        body.priceCents ?? 0,
        body.currency ?? 'INR',
        body.capacity ?? null,
        body.maxPerOrder ?? 4,
        body.requiresApproval ?? false,
        body.isHidden ?? false,
        body.salesStart ?? null,
        body.salesEnd ?? null,
        body.sortOrder ?? 0,
      ],
    );

    res.status(201).json({ ticketType: created });
  }),
);

/** PATCH /api/ticket-types/:id */
eventsRouter.patch(
  '/ticket-types/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const body = parseBody(req, ticketSchema.partial());

    const ticket = await one<{ event_id: string }>(
      'SELECT event_id FROM ticket_types WHERE id = $1',
      [id],
    );
    if (!ticket) throw notFound('That ticket type does not exist.');
    await assertEventAccess(req, ticket.event_id, 'manager');

    const updated = await one(
      `UPDATE ticket_types
          SET name              = COALESCE($2, name),
              description       = COALESCE($3, description),
              payment_type      = COALESCE($4, payment_type),
              price_cents       = COALESCE($5, price_cents),
              capacity          = COALESCE($6, capacity),
              max_per_order     = COALESCE($7, max_per_order),
              requires_approval = COALESCE($8, requires_approval),
              is_hidden         = COALESCE($9, is_hidden),
              sales_start       = COALESCE($10, sales_start),
              sales_end         = COALESCE($11, sales_end),
              sort_order        = COALESCE($12, sort_order)
        WHERE id = $1
        RETURNING *`,
      [
        id,
        body.name ?? null,
        body.description ?? null,
        body.paymentType ?? null,
        body.priceCents ?? null,
        body.capacity ?? null,
        body.maxPerOrder ?? null,
        body.requiresApproval ?? null,
        body.isHidden ?? null,
        body.salesStart ?? null,
        body.salesEnd ?? null,
        body.sortOrder ?? null,
      ],
    );

    res.json({ ticketType: updated });
  }),
);

/** DELETE /api/ticket-types/:id — only allowed while it has no guests. */
eventsRouter.delete(
  '/ticket-types/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const ticket = await one<{ event_id: string }>(
      'SELECT event_id FROM ticket_types WHERE id = $1',
      [id],
    );
    if (!ticket) throw notFound('That ticket type does not exist.');
    await assertEventAccess(req, ticket.event_id, 'manager');

    const used = await one<{ n: number }>(
      'SELECT count(*)::int AS n FROM guests WHERE ticket_type_id = $1 AND is_invalidated = false',
      [id],
    );
    if ((used?.n ?? 0) > 0) {
      throw badRequest('Tickets have been sold on this type — hide it instead of deleting.');
    }

    await query('DELETE FROM ticket_types WHERE id = $1', [id]);
    res.json({ ok: true });
  }),
);

const questionSchema = z.object({
  questionText: z.string().trim().min(2, 'Write the question.').max(500),
  questionType: z.enum(['text', 'textarea', 'select', 'checkbox', 'number', 'terms']).optional(),
  required: z.boolean().optional(),
  options: z.array(z.string().max(200)).max(50).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

/** POST /api/events/:id/questions — add a registration question. */
eventsRouter.post(
  '/:id/questions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    await assertEventAccess(req, id, 'manager');
    const body = parseBody(req, questionSchema);

    const created = await one(
      `INSERT INTO registration_questions (event_id, question_text, question_type,
                                           required, options, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        id,
        body.questionText,
        body.questionType ?? 'text',
        body.required ?? false,
        body.options ? JSON.stringify(body.options) : null,
        body.sortOrder ?? 0,
      ],
    );

    res.status(201).json({ question: created });
  }),
);

/** DELETE /api/questions/:id */
eventsRouter.delete(
  '/questions/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = parseParams(req, idParam);
    const question = await one<{ event_id: string }>(
      'SELECT event_id FROM registration_questions WHERE id = $1',
      [id],
    );
    if (!question) throw notFound('That question does not exist.');
    await assertEventAccess(req, question.event_id, 'manager');

    await query('DELETE FROM registration_questions WHERE id = $1', [id]);
    res.json({ ok: true });
  }),
);
/** Save ticket/question configuration together without replacing event or guest IDs. */
eventsRouter.post('/:id/config',requireAuth,asyncHandler(async(req,res)=>{
 const {id}=parseParams(req,idParam);await assertEventAccess(req,id,'manager');
 const body=parseBody(req,z.object({tickets:z.array(z.object({id:z.string(),name:z.string().trim().min(1).max(120),price:z.number().min(0),ticket_kind:z.enum(['free','approval'])})),questions:z.array(z.object({id:z.union([z.string(),z.number()]),label:z.string().trim().min(2).max(500),required:z.boolean()}))}));
 await tx(async client=>{await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[id]);await events.saveConfiguration(client,id,body); });res.json({ok:true});
}));
