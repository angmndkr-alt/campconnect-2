import type { PoolClient } from 'pg';
import { one, query, rows, tx } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { slugify, uniqueSlug } from '../lib/http.js';
import { PUBLIC_EVENT_COLUMNS, type EventVisibility, type EventKind } from '../types.js';

export type EventRow = {
  id: string;
  calendar_id: string;
  owner_id: string | null;
  title: string;
  slug: string;
  category: string;
  description: string | null;
  event_type: EventKind;
  visibility: EventVisibility;
  date: string;
  end_date: string | null;
  time: string;
  end_time: string | null;
  timezone: string;
  venue: string;
  online_url: string | null;
  xp: number;
  tone: string;
  cover_url: string | null;
  max_capacity: number | null;
  requires_approval: boolean;
  waitlist_enabled: boolean;
  is_published: boolean;
  is_canceled: boolean;
  created_at: string;
  updated_at: string;
};

export type EventInput = {
  tickets?:RegistrationConfig['tickets'];
  questions?:RegistrationConfig['questions'];
  calendarId: string;
  title: string;
  category?: string;
  description?: string;
  eventType?: EventKind;
  visibility?: EventVisibility;
  date: string;
  endDate?: string | null;
  time: string;
  endTime?: string | null;
  timezone?: string;
  venue?: string;
  onlineUrl?: string | null;
  xp?: number;
  tone?: string;
  coverUrl?: string | null;
  maxCapacity?: number | null;
  requiresApproval?: boolean;
  waitlistEnabled?: boolean;
  isPublished?: boolean;
};

const slugTaken = async (candidate: string, ignoreId?: string): Promise<boolean> => {
  const row = await one<{ id: string }>(
    'SELECT id FROM events WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)',
    [candidate, ignoreId ?? null],
  );
  return Boolean(row);
};

const logActivity = async (
  userId: string | null,
  calendarId: string,
  action: string,
  details?: string,
) => {
  await query(
    'INSERT INTO activity_log (user_id, calendar_id, action, details) VALUES ($1, $2, $3, $4)',
    [userId, calendarId, action, details ?? null],
  );
};

/** Events visible to the public plus any belong to `viewerCalendarIds`. */
export async function listEvents(params: {
  calendarId?: string;
  category?: string;
  search?: string;
  range?: 'upcoming' | 'past' | 'all';
  includeUnpublished?: boolean;
  limit?: number;
} = {}): Promise<EventRow[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const range = params.range ?? 'upcoming';

  const conditions: string[] = [];
  const values: unknown[] = [];

  conditions.push('e.is_published = true');
  if (!params.includeUnpublished) {
    conditions.push('e.visibility = $' + (values.length + 1));
    values.push('public');
  }

  if (params.calendarId) {
    values.push(params.calendarId);
    conditions.push(`e.calendar_id = $${values.length}`);
  }

  if (params.category && params.category !== 'All') {
    values.push(params.category);
    conditions.push(`e.category = $${values.length}`);
  }

  if (params.search) {
    values.push(`%${params.search}%`);
    conditions.push(
      `(e.title ILIKE $${values.length} OR e.venue ILIKE $${values.length} OR e.description ILIKE $${values.length})`,
    );
  }

  if (range === 'upcoming') {
    conditions.push(`e.date >= CURRENT_DATE`);
  } else if (range === 'past') {
    conditions.push(`e.date < CURRENT_DATE`);
  }

  values.push(limit);

  return rows<EventRow>(
    `SELECT ${PUBLIC_EVENT_COLUMNS}
       FROM events e
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.date ASC, e.time ASC
      LIMIT $${values.length}`,
    values,
  );
}

export async function getEventById(id: string): Promise<EventRow | null> {
  return one<EventRow>(`SELECT ${PUBLIC_EVENT_COLUMNS} FROM events WHERE id = $1`, [id]);
}

export async function getEventBySlug(slug: string): Promise<EventRow | null> {
  return one<EventRow>(`SELECT ${PUBLIC_EVENT_COLUMNS} FROM events WHERE slug = $1`, [slug]);
}

/** Full event detail used by the manage/dashboard tabs. */
export async function getManagedEvent(id: string) {
  const event = await getEventById(id);
  if (!event) throw notFound('That event does not exist.');

  const [calendar, hosts, ticketTypes, questions, stats] = await Promise.all([
    one('SELECT * FROM calendars WHERE id = $1', [event.calendar_id]),
    rows('SELECT * FROM event_hosts WHERE event_id = $1 ORDER BY name', [id]),
    rows(
      `SELECT * FROM ticket_types WHERE event_id = $1 ORDER BY sort_order, created_at`,
      [id],
    ),
    rows(
      `SELECT * FROM registration_questions WHERE event_id = $1 ORDER BY sort_order, created_at`,
      [id],
    ),
    one('SELECT * FROM event_guest_stats WHERE event_id = $1', [id]),
  ]);

  return { ...event, calendar, hosts, ticketTypes, questions, stats };
}

/** Create an event (club admins only — enforced by the caller's calendar role). */
export async function createEvent(ownerId: string, input: EventInput): Promise<EventRow> {
  return tx(async client=>{
  const calendar = await one<{ id: string }>('SELECT id FROM calendars WHERE id = $1', [
    input.calendarId,
  ]);
  if (!calendar) throw notFound('That club does not exist.');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    throw badRequest('Pick a valid date for the event.');
  }

  const slug = await uniqueSlug(input.title, (candidate) => slugTaken(candidate));

  const row = (await client.query<EventRow>(
    `INSERT INTO events (
        calendar_id, owner_id, title, slug, category, description, event_type, visibility,
        date, end_date, time, end_time, timezone, venue, online_url, xp, tone, cover_url,
        max_capacity, requires_approval, waitlist_enabled, is_published
     ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22
     )
     RETURNING ${PUBLIC_EVENT_COLUMNS}`,
    [
      input.calendarId,
      ownerId,
      input.title.trim(),
      slug,
      input.category ?? 'Cultural',
      input.description ?? null,
      input.eventType ?? 'in_person',
      input.visibility ?? 'public',
      input.date,
      input.endDate ?? null,
      input.time,
      input.endTime ?? null,
      input.timezone ?? 'Asia/Kolkata',
      input.venue ?? '',
      input.onlineUrl ?? null,
      input.xp ?? 80,
      input.tone ?? 'mint',
      input.coverUrl ?? null,
      input.maxCapacity ?? null,
      input.requiresApproval ?? false,
      input.waitlistEnabled ?? true,
      input.isPublished ?? true,
    ],
  )).rows[0];

  if (!row) throw new Error('Failed to create event.');

  // Every event needs at least one ticket type, mirroring Luma.
  await client.query(
    `INSERT INTO ticket_types (event_id, name, requires_approval, capacity)
     VALUES ($1, 'Standard', $2, $3)`,
    [row.id, input.requiresApproval ?? false, null],
  );

  if(input.tickets!==undefined||input.questions!==undefined)await saveConfiguration(client,row.id,{tickets:input.tickets,questions:input.questions});
  await client.query('INSERT INTO activity_log(user_id,calendar_id,action,details) VALUES($1,$2,$3,$4)',[ownerId,input.calendarId,'event_created',row.title]);
  return row;
  });
}

export async function updateEvent(
  id: string,
  patch: Partial<EventInput>,
  userId: string,
): Promise<EventRow> {
  return tx(async client=>{
  const existing=(await client.query<EventRow>('SELECT * FROM events WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if (!existing) throw notFound('That event does not exist.');

  if (patch.date && !/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) {
    throw badRequest('Pick a valid date for the event.');
  }

  const row = (await client.query<EventRow>(
    `UPDATE events
        SET title             = COALESCE($2, title),
            category          = COALESCE($3, category),
            description       = COALESCE($4, description),
            event_type        = COALESCE($5, event_type),
            visibility        = COALESCE($6, visibility),
            date              = COALESCE($7, date),
            end_date          = COALESCE($8, end_date),
            time              = COALESCE($9, time),
            end_time          = COALESCE($10, end_time),
            timezone          = COALESCE($11, timezone),
            venue             = COALESCE($12, venue),
            online_url        = COALESCE($13, online_url),
            xp                = COALESCE($14, xp),
            tone              = COALESCE($15, tone),
            cover_url         = COALESCE($16, cover_url),
            max_capacity      = CASE WHEN $21::boolean THEN $17 ELSE max_capacity END,
            requires_approval = COALESCE($18, requires_approval),
            waitlist_enabled  = COALESCE($19, waitlist_enabled),
            is_published      = COALESCE($20, is_published)
      WHERE id = $1
      RETURNING ${PUBLIC_EVENT_COLUMNS}`,
    [
      id,
      patch.title?.trim() ?? null,
      patch.category ?? null,
      patch.description ?? null,
      patch.eventType ?? null,
      patch.visibility ?? null,
      patch.date ?? null,
      patch.endDate ?? null,
      patch.time ?? null,
      patch.endTime ?? null,
      patch.timezone ?? null,
      patch.venue ?? null,
      patch.onlineUrl ?? null,
      patch.xp ?? null,
      patch.tone ?? null,
      patch.coverUrl ?? null,
      patch.maxCapacity ?? null,
      patch.requiresApproval ?? null,
      patch.waitlistEnabled ?? null,
      patch.isPublished ?? null,
      patch.maxCapacity!==undefined,
    ],
  )).rows[0];

  if (!row) throw notFound('That event does not exist.');
  if(patch.tickets!==undefined||patch.questions!==undefined)await saveConfiguration(client,id,{tickets:patch.tickets,questions:patch.questions});
  await client.query('INSERT INTO activity_log(user_id,calendar_id,action,details) VALUES($1,$2,$3,$4)',[userId,existing.calendar_id,'event_updated',row.title]);
  return row;
  });
}

export async function deleteEvent(id: string, userId: string): Promise<void> {
  const existing = await getEventById(id);
  if (!existing) throw notFound('That event does not exist.');

  await query('DELETE FROM events WHERE id = $1', [id]);
  await logActivity(userId, existing.calendar_id, 'event_deleted', existing.title);
}

/** Ticket types + registration questions for the public event page. */
export async function getRegistrationConfig(eventId: string) {
  const [ticketTypes, questions] = await Promise.all([
    rows(
      `SELECT * FROM ticket_types
        WHERE event_id = $1 AND is_hidden = false
        ORDER BY sort_order, created_at`,
      [eventId],
    ),
    rows(
      `SELECT id, question_text, question_type, required, options, sort_order
         FROM registration_questions
        WHERE event_id = $1
        ORDER BY sort_order, created_at`,
      [eventId],
    ),
  ]);

  return { ticketTypes, questions };
}
export type RegistrationConfig={tickets?:Array<{id:string;name:string;price:number;ticket_kind:'free'|'approval'}>;questions?:Array<{id:string|number;label:string;required:boolean}>};
export async function saveConfiguration(client:PoolClient,id:string,body:RegistrationConfig){

  if(body.tickets!==undefined){
  const old=(await client.query('SELECT id FROM ticket_types WHERE event_id=$1',[id])).rows;
  for(const [sortOrder,t] of body.tickets.entries()){if(old.some(o=>o.id===t.id))await client.query(`UPDATE ticket_types SET name=$2,requires_approval=$3,is_hidden=false,sort_order=$4,payment_type='free',price_cents=0 WHERE id=$1`,[t.id,t.name,t.ticket_kind==='approval',sortOrder]);else await client.query("INSERT INTO ticket_types(event_id,name,requires_approval,sort_order) VALUES($1,$2,$3,$4)",[id,t.name,t.ticket_kind==='approval',sortOrder]);}
  if(body.tickets.length){for(const t of old){if(!body.tickets.some(n=>n.id===t.id)){const used=(await client.query('SELECT 1 FROM guests WHERE ticket_type_id=$1 LIMIT 1',[t.id])).rowCount;if(used)await client.query('UPDATE ticket_types SET is_hidden=true WHERE id=$1',[t.id]);else await client.query('DELETE FROM ticket_types WHERE id=$1',[t.id]);}}}
  else {await client.query('UPDATE ticket_types SET is_hidden=true WHERE event_id=$1',[id]);await client.query("INSERT INTO ticket_types(event_id,name,requires_approval) SELECT id,'Standard',requires_approval FROM events WHERE id=$1",[id]);}
  }
  if(body.questions!==undefined){
  const qs=(await client.query('SELECT id FROM registration_questions WHERE event_id=$1',[id])).rows;
  for(const [sortOrder,q] of body.questions.entries()){if(qs.some(o=>o.id===q.id))await client.query('UPDATE registration_questions SET question_text=$2,required=$3,sort_order=$4 WHERE id=$1',[q.id,q.label,q.required,sortOrder]);else await client.query('INSERT INTO registration_questions(event_id,question_text,required,sort_order) VALUES($1,$2,$3,$4)',[id,q.label,q.required,sortOrder]);}
  for(const q of qs){if(!body.questions.some(n=>n.id===q.id))await client.query('DELETE FROM registration_questions WHERE id=$1',[q.id]);}
  }

}
