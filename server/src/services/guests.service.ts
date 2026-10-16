import { one, query, rows, tx } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normaliseEmail } from '../lib/http.js';
import { PUBLIC_GUEST_COLUMNS, type ApprovalStatus, type CheckinMethod } from '../types.js';

export type GuestRow = {
  id: string;
  event_id: string;
  ticket_type_id: string | null;
  profile_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  department: string | null;
  year: string | null;
  status: ApprovalStatus;
  qr_token: string;
  note: string | null;
  checked_in_at: string | null;
  is_invalidated: boolean;
  registered_at: string;
  updated_at: string;
};

export const APPROVED: ApprovalStatus = 'approved';
export const PENDING: ApprovalStatus = 'pending_approval';
export const WAITLIST: ApprovalStatus = 'waitlist';
export const DECLINED: ApprovalStatus = 'declined';

type EventCard = {
  id: string;
  max_capacity: number | null;
  requires_approval: boolean;
  waitlist_enabled: boolean;
  is_published: boolean;
  is_canceled: boolean;
  calendar_id: string;
  title: string;
};

const loadEvent = async (eventId: string): Promise<EventCard | null> =>
  one<EventCard>(
    `SELECT id, max_capacity, requires_approval, waitlist_enabled, is_published,
            is_canceled, calendar_id, title
       FROM events WHERE id = $1`,
    [eventId],
  );

const approvedCount = async (eventId: string, ticketTypeId?: string | null) => {
  const row = await one<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM guests
      WHERE event_id = $1
        AND status = 'approved'
        AND is_invalidated = false
        AND ($2::uuid IS NULL OR ticket_type_id = $2::uuid)`,
    [eventId, ticketTypeId ?? null],
  );
  return row?.n ?? 0;
};

export async function listGuests(params: {
  eventId: string;
  status?: 'all' | ApprovalStatus | 'checked_in' | 'not_checked_in';
  search?: string;
  sort?: 'registered_at' | 'full_name' | 'checked_in_at';
  order?: 'asc' | 'desc';
  limit?: number;
}) {
  const conditions: string[] = ['event_id = $1'];
  const values: unknown[] = [params.eventId];

  switch (params.status) {
    case undefined:
    case 'all':
      break;
    case 'checked_in':
      conditions.push('checked_in_at IS NOT NULL');
      break;
    case 'not_checked_in':
      conditions.push(`status = 'approved' AND checked_in_at IS NULL`);
      break;
    default:
      values.push(params.status);
      conditions.push(`status = $${values.length}`);
  }

  if (params.search) {
    values.push(`%${params.search.trim()}%`);
    conditions.push(`(full_name ILIKE $${values.length} OR email ILIKE $${values.length})`);
  }

  const sortColumn =
    params.sort === 'full_name'
      ? 'full_name'
      : params.sort === 'checked_in_at'
        ? 'checked_in_at'
        : 'registered_at';
  const order = params.order === 'asc' ? 'ASC' : 'DESC';
  values.push(Math.min(Math.max(params.limit ?? 500, 1), 1000));

  const [guests, stats] = await Promise.all([
    rows(
      `SELECT * FROM guest_details
        WHERE ${conditions.join(' AND ')}
        ORDER BY ${sortColumn} ${order} NULLS LAST, registered_at DESC
        LIMIT $${values.length}`,
      values,
    ),
    one('SELECT * FROM event_guest_stats WHERE event_id = $1', [params.eventId]),
  ]);

  return { guests, stats: stats ?? zeroStats(params.eventId) };
}

function zeroStats(eventId: string) {
  return {
    event_id: eventId,
    going_count: 0,
    pending_count: 0,
    waitlist_count: 0,
    invited_count: 0,
    declined_count: 0,
    checked_in_count: 0,
    not_checked_in_count: 0,
    total_count: 0,
  };
}

export async function registerForEvent(input: {
  eventId: string;
  fullName: string;
  email: string;
  phone?: string;
  department?: string;
  year?: string;
  ticketTypeId?: string;
  profileId?: string;
  answers?: Array<{ questionId: string; answer: string }>;
}): Promise<GuestRow & { status_label: string }> {
  const email=normaliseEmail(input.email);
  return tx(async client=>{
    const event=(await client.query<EventCard>('SELECT * FROM events WHERE id=$1 FOR UPDATE',[input.eventId])).rows[0];
    if(!event)throw notFound('That event does not exist.');if(event.is_canceled||!event.is_published)throw badRequest('Registration for this event is not open.');
    const exists=(await client.query('SELECT id FROM guests WHERE event_id=$1 AND lower(email)=$2 AND is_invalidated=false',[input.eventId,email])).rows[0];if(exists)throw conflict('You are already registered for this event.');
    const ticket=(await client.query(`SELECT * FROM ticket_types WHERE event_id=$1 AND is_hidden=false AND ($2::uuid IS NULL OR id=$2::uuid) ORDER BY sort_order,created_at LIMIT 1`,[input.eventId,input.ticketTypeId||null])).rows[0];
    if(!ticket)throw badRequest('That ticket type is not available.');if(ticket.payment_type==='paid')throw badRequest('Paid checkout is not connected for this event.');
    const qs=(await client.query('SELECT * FROM registration_questions WHERE event_id=$1',[input.eventId])).rows;
    for(const q of qs)if(q.required&&!input.answers?.some(a=>a.questionId===q.id&&a.answer.trim()))throw badRequest('Answer the required question: '+q.question_text);
    if(input.answers?.some(a=>!qs.some(q=>q.id===a.questionId)))throw badRequest('A question is not part of this event.');
    let status:ApprovalStatus=ticket.requires_approval||event.requires_approval?PENDING:APPROVED;
    if(status===APPROVED&&!await hasRoom(client,event,ticket.id)){if(!event.waitlist_enabled)throw conflict('This event or ticket tier is full.');status=WAITLIST;}
    const row=(await client.query<GuestRow>(`INSERT INTO guests(event_id,ticket_type_id,profile_id,full_name,email,phone,department,year,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${PUBLIC_GUEST_COLUMNS}`,[input.eventId,ticket.id,input.profileId||null,input.fullName.trim(),email,input.phone||null,input.department||null,input.year||null,status])).rows[0];
    for(const answer of input.answers||[])if(answer.answer.trim())await client.query('INSERT INTO registration_answers(guest_id,question_id,answer_text) VALUES($1,$2,$3)',[row.id,answer.questionId,answer.answer]);
    await client.query('INSERT INTO activity_log(user_id,calendar_id,action,details) VALUES($1,$2,$3,$4)',[input.profileId||null,event.calendar_id,'guest_registered',event.title]);
    return {...row,status_label:status==='pending_approval'?'Pending approval':status==='waitlist'?'Waitlist':'Approved'};
  });
}

export async function findMyRegistration(
  eventId: string,
  identity: { profileId?: string; email?: string },
): Promise<GuestRow | null> {
  if (identity.profileId) {
    const byProfile = await one<GuestRow>(
      `SELECT ${PUBLIC_GUEST_COLUMNS} FROM guests
        WHERE event_id = $1 AND profile_id = $2 AND is_invalidated = false
        ORDER BY registered_at DESC LIMIT 1`,
      [eventId, identity.profileId],
    );
    if (byProfile) return byProfile;
  }

  if (identity.email) {
    return one<GuestRow>(
      `SELECT ${PUBLIC_GUEST_COLUMNS} FROM guests
        WHERE event_id = $1 AND lower(email) = lower($2) AND is_invalidated = false
        ORDER BY registered_at DESC LIMIT 1`,
      [eventId, identity.email],
    );
  }

  return null;
}

/** Self-service cancel: marks the registration as declined. */
export async function cancelRegistration(guestId:string,profileId:string):Promise<GuestRow>{
 const initial=await one<GuestRow>('SELECT * FROM guests WHERE id=$1 AND profile_id=$2',[guestId,profileId]);if(!initial)throw notFound('Registration not found.');
 return tx(async client=>{await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[initial.event_id]);const guest=(await client.query<GuestRow>('SELECT * FROM guests WHERE id=$1 AND profile_id=$2 FOR UPDATE',[guestId,profileId])).rows[0];if(!guest)throw notFound('Registration not found.');await client.query('DELETE FROM check_ins WHERE guest_id=$1',[guestId]);return (await client.query<GuestRow>(`UPDATE guests SET status='declined',is_invalidated=true,checked_in_at=NULL,updated_at=now() WHERE id=$1 RETURNING ${PUBLIC_GUEST_COLUMNS}`,[guestId])).rows[0];});
}

/** Capacity is checked while the caller holds the event row lock. */
async function hasRoom(client:any,event:EventCard,ticketId:string|null):Promise<boolean>{
 const count=(await client.query(`SELECT count(*)::int AS n FROM guests WHERE event_id=$1 AND status='approved' AND is_invalidated=false`,[event.id])).rows[0].n;
 if(event.max_capacity!==null&&count>=event.max_capacity)return false;
 if(ticketId){const ticket=(await client.query('SELECT capacity FROM ticket_types WHERE id=$1',[ticketId])).rows[0];if(ticket?.capacity!==null&&ticket?.capacity!==undefined){const n=(await client.query(`SELECT count(*)::int AS n FROM guests WHERE event_id=$1 AND ticket_type_id=$2 AND status='approved' AND is_invalidated=false`,[event.id,ticketId])).rows[0].n;if(n>=ticket.capacity)return false;}}
 return true;
}
async function applyStatus(client:any,event:EventCard,current:GuestRow,status:ApprovalStatus,note?:string):Promise<GuestRow>{
 if(current.is_invalidated)throw notFound('Registration no longer exists.');
 if(status==='approved'&&current.status!=='approved'&&!await hasRoom(client,event,current.ticket_type_id))throw conflict('This event or ticket tier is already at capacity.');
 if(status!=='approved')await client.query('DELETE FROM check_ins WHERE guest_id=$1',[current.id]);
 return (await client.query(`UPDATE guests SET status=$2::approval_status,note=COALESCE($3,note),checked_in_at=CASE WHEN $2::approval_status='approved' THEN checked_in_at ELSE NULL END,updated_at=now() WHERE id=$1 RETURNING ${PUBLIC_GUEST_COLUMNS}`,[current.id,status,note||null])).rows[0];
}
export async function setGuestStatus(input:{guestId:string;status:ApprovalStatus;note?:string}):Promise<GuestRow>{
 const guest=await one<GuestRow>('SELECT * FROM guests WHERE id=$1',[input.guestId]);if(!guest)throw notFound('Guest not found.');
 return tx(async client=>{const event=(await client.query<EventCard>('SELECT * FROM events WHERE id=$1 FOR UPDATE',[guest.event_id])).rows[0];const current=(await client.query<GuestRow>('SELECT * FROM guests WHERE id=$1 FOR UPDATE',[input.guestId])).rows[0];if(!current)throw notFound('Guest not found.');return applyStatus(client,event,current,input.status,input.note);});
}
export async function bulkSetStatus(input:{eventId:string;emails:string[];status:ApprovalStatus;note?:string}):Promise<{updated:number;skipped:number}>{
 const emails=[...new Set(input.emails.map(normaliseEmail))];
 return tx(async client=>{const event=(await client.query<EventCard>('SELECT * FROM events WHERE id=$1 FOR UPDATE',[input.eventId])).rows[0];if(!event)throw notFound('Event not found.');const guests=(await client.query<GuestRow>('SELECT * FROM guests WHERE event_id=$1 AND lower(email)=ANY($2::text[]) AND is_invalidated=false FOR UPDATE',[input.eventId,emails])).rows;for(const g of guests)await applyStatus(client,event,g,input.status,input.note);return {updated:guests.length,skipped:emails.length-guests.length};});
}
export async function bulkResolvePending(input:{eventId:string;approve:boolean}):Promise<number>{
 const guests=await rows<GuestRow>(`SELECT * FROM guests WHERE event_id=$1 AND status='pending_approval' AND is_invalidated=false`,[input.eventId]);const result=await bulkSetStatus({eventId:input.eventId,emails:guests.map(g=>g.email),status:input.approve?'approved':'declined'});return result.updated;
}

export type CheckInResult = {
  guest: GuestRow;
  alreadyCheckedIn: boolean;
  ticketName: string | null;
};

/**
 * Check a guest in. Accepts either a scanned QR token or a guest id from the
 * manual search list. Only `approved` guests may be checked in.
 */
export async function checkIn(input:{eventId:string;qrToken?:string;guestId?:string;method:CheckinMethod;checkedInBy:string}):Promise<CheckInResult>{
 return tx(async client=>{
  const event=(await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[input.eventId])).rows[0];if(!event)throw notFound('Event not found.');
  const guest=(await client.query<GuestRow>(`SELECT ${PUBLIC_GUEST_COLUMNS} FROM guests WHERE ${input.qrToken?'qr_token=$1':'id=$1'} FOR UPDATE`,[input.qrToken||input.guestId])).rows[0];
  if(!guest)throw notFound('No ticket matches that scan.');if(guest.event_id!==input.eventId)throw badRequest('That ticket belongs to a different event.');if(guest.is_invalidated)throw badRequest('That ticket is no longer valid.');if(guest.status!=='approved')throw badRequest('This guest has not been approved for entry.');
  if(guest.checked_in_at)return {guest,alreadyCheckedIn:true,ticketName:null};
  await client.query('INSERT INTO check_ins(guest_id,event_id,checked_in_by,method) VALUES($1,$2,$3,$4)',[guest.id,input.eventId,input.checkedInBy,input.method]);
  const updated=(await client.query<GuestRow>(`SELECT ${PUBLIC_GUEST_COLUMNS} FROM guests WHERE id=$1`,[guest.id])).rows[0];const ticket=(await client.query('SELECT name FROM ticket_types WHERE id=$1',[guest.ticket_type_id])).rows[0];return {guest:updated,alreadyCheckedIn:false,ticketName:ticket?.name||null};
 });
}
export async function undoCheckIn(input:{eventId:string;guestId:string}):Promise<GuestRow>{
 return tx(async client=>{await client.query('SELECT id FROM events WHERE id=$1 FOR UPDATE',[input.eventId]);const guest=(await client.query<GuestRow>(`SELECT ${PUBLIC_GUEST_COLUMNS} FROM guests WHERE id=$1 FOR UPDATE`,[input.guestId])).rows[0];if(!guest||guest.event_id!==input.eventId)throw notFound('Guest not found.');if(!guest.checked_in_at)throw badRequest('That guest is not checked in.');await client.query('DELETE FROM check_ins WHERE guest_id=$1 AND event_id=$2',[input.guestId,input.eventId]);return (await client.query<GuestRow>(`SELECT ${PUBLIC_GUEST_COLUMNS} FROM guests WHERE id=$1`,[input.guestId])).rows[0];});
}

const csvCell = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** Guest list as CSV — same columns Luma's export offers. */
export async function guestsCsv(eventId: string): Promise<string> {
  const guests = await rows<Record<string, unknown>>(
    `SELECT full_name, email, phone, department, year, status, ticket_name,
            registered_at, checked_in_at, qr_token
       FROM guest_details
      WHERE event_id = $1 AND is_invalidated = false
      ORDER BY registered_at DESC`,
    [eventId],
  );

  const header = [
    'Full Name',
    'Email',
    'Phone',
    'Department',
    'Year',
    'Status',
    'Ticket',
    'Registered At',
    'Checked In At',
    'QR Token',
  ];

  const lines = guests.map((g) =>
    [
      g.full_name,
      g.email,
      g.phone,
      g.department,
      g.year,
      g.status,
      g.ticket_name,
      g.registered_at,
      g.checked_in_at,
      g.qr_token,
    ]
      .map(csvCell)
      .join(','),
  );

  return [header.join(','), ...lines].join('\r\n');
}