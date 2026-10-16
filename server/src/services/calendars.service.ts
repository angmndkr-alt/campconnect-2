import { one, query, rows } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { slugify } from '../lib/http.js';
import type { CalendarAdminRole } from '../types.js';

export type CalendarRow = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  tone: string;
  blurb: string | null;
  cover_url: string | null;
  members_count: number;
  created_at: string;
};

export async function listCalendars(): Promise<CalendarRow[]> {
  return rows<CalendarRow>('SELECT * FROM calendars ORDER BY members_count DESC, name');
}

export async function getCalendar(idOrSlug: string): Promise<CalendarRow | null> {
  return one<CalendarRow>('SELECT * FROM calendars WHERE id = $1 OR slug = $1', [idOrSlug]);
}

export async function createCalendar(input: {
  id: string;
  name: string;
  blurb?: string;
  icon?: string;
  tone?: string;
  ownerId?: string;
}): Promise<CalendarRow> {
  const id = slugify(input.id || input.name);

  const exists = await getCalendar(id);
  if (exists) throw conflict('A club with that identifier already exists.');

  const row = await one<CalendarRow>(
    `INSERT INTO calendars (id, slug, name, icon, tone, blurb)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id, id, input.name, (input.icon ?? input.name.slice(0, 2)).toUpperCase(), input.tone ?? 'mint', input.blurb ?? null],
  );

  if (!row) throw new Error('Failed to create club.');

  if (input.ownerId) {
    await query(
      `INSERT INTO calendar_admins (calendar_id, profile_id, role)
       VALUES ($1, $2, 'owner') ON CONFLICT DO NOTHING`,
      [row.id, input.ownerId],
    );
  }

  return row;
}

export type CalendarAdminWithProfile = {
  calendar_id: string;
  profile_id: string;
  role: CalendarAdminRole;
  created_at: string;
  email: string;
  full_name: string;
  department: string | null;
  year_or_designation: string | null;
  avatar_url: string | null;
};

export async function listCalendarAdmins(calendarId: string): Promise<CalendarAdminWithProfile[]> {
  return rows<CalendarAdminWithProfile>(
    `SELECT ca.calendar_id, ca.profile_id, ca.role, ca.created_at,
            p.email, p.full_name, p.department, p.year_or_designation, p.avatar_url
       FROM calendar_admins ca
       JOIN profiles p ON p.id = ca.profile_id
      WHERE ca.calendar_id = $1
      ORDER BY ca.created_at`,
    [calendarId],
  );
}

/** Grant (or promote) a person's admin role on a club. */
export async function addCalendarAdmin(input: {
  calendarId: string;
  profileId: string;
  role: CalendarAdminRole;
}): Promise<void> {
  const calendar = await getCalendar(input.calendarId);
  if (!calendar) throw notFound('That club does not exist.');

  const profile = await one<{ id: string }>('SELECT id FROM profiles WHERE id = $1', [
    input.profileId,
  ]);
  if (!profile) throw notFound('That account does not exist.');

  await query(
    `INSERT INTO calendar_admins (calendar_id, profile_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (calendar_id, profile_id) DO UPDATE SET role = EXCLUDED.role`,
    [input.calendarId, input.profileId, input.role],
  );

  // Promote the person's global role so they can reach the admin workspace.
  if (input.role !== 'checkin_staff') {
    await query(
      `UPDATE profiles SET role = 'club_admin', updated_at = now()
        WHERE id = $1 AND role = 'student'`,
      [input.profileId],
    );
  }
}

export async function removeCalendarAdmin(
  calendarId: string,
  profileId: string,
): Promise<void> {
  const current = await one<{ role: CalendarAdminRole }>(
    'SELECT role FROM calendar_admins WHERE calendar_id = $1 AND profile_id = $2',
    [calendarId, profileId],
  );

  if (!current) throw notFound('That person is not an admin of this club.');
  if (current.role === 'owner') {
    throw badRequest('Remove the owner role from another account first.');
  }

  await query('DELETE FROM calendar_admins WHERE calendar_id = $1 AND profile_id = $2', [
    calendarId,
    profileId,
  ]);
}

/** Clubs a profile follows (used by the dashboard's shortcut list). */
export async function listFollowing(profileId: string): Promise<string[]> {
  const list = await rows<{ calendar_id: string }>(
    'SELECT calendar_id FROM follows WHERE profile_id = $1',
    [profileId],
  );
  return list.map((f) => f.calendar_id);
}

export async function toggleFollow(profileId: string, calendarId: string): Promise<boolean> {
  const calendar = await getCalendar(calendarId);
  if (!calendar) throw notFound('That club does not exist.');

  const existing = await one(
    'SELECT 1 AS x FROM follows WHERE profile_id = $1 AND calendar_id = $2',
    [profileId, calendarId],
  );

  if (existing) {
    await query('DELETE FROM follows WHERE profile_id = $1 AND calendar_id = $2', [
      profileId,
      calendarId,
    ]);
    await query('SELECT refresh_calendar_member_count($1)', [calendarId]);
    return false;
  }

  await query('INSERT INTO follows (profile_id, calendar_id) VALUES ($1, $2)', [
    profileId,
    calendarId,
  ]);
  await query('SELECT refresh_calendar_member_count($1)', [calendarId]);
  return true;
}