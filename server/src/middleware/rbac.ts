import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../lib/errors.js';
import { one } from '../db/pool.js';
import type { CalendarAdminRole } from '../types.js';

type MembershipRow = { role: CalendarAdminRole };

/** Role hierarchy: an owner can do anything a manager can, etc. */
const RANK: Record<CalendarAdminRole, number> = {
  checkin_staff: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

/**
 * Look up the caller's role on a calendar.
 * Super admins implicitly hold `owner` on every calendar.
 */
export async function calendarRoleOf(
  userId: string,
  calendarId: string,
  globalRole?: string,
): Promise<CalendarAdminRole | null> {
  if (globalRole === 'super_admin') return 'owner';

  const row = await one<MembershipRow>(
    'SELECT role FROM calendar_admins WHERE calendar_id = $1 AND profile_id = $2',
    [calendarId, userId],
  );

  return row?.role ?? null;
}

/** Resolve a calendar id from either a route param or from an event id. */
export async function calendarIdForEvent(eventId: string): Promise<string | null> {
  const row = await one<{ calendar_id: string }>(
    'SELECT calendar_id FROM events WHERE id = $1',
    [eventId],
  );
  return row?.calendar_id ?? null;
}

/** Throws unless the caller holds at least `minimum` on the calendar. */
export async function assertCalendarRole(
  req: Request,
  calendarId: string,
  minimum: CalendarAdminRole,
): Promise<CalendarAdminRole> {
  if (!req.user) throw unauthorized();

  const role = await calendarRoleOf(req.user.id, calendarId, req.user.role);
  if (!role) throw forbidden('You do not manage this club.');

  if (RANK[role] < RANK[minimum]) {
    throw forbidden(`This action requires the "${minimum}" role on this club.`);
  }

  return role;
}

/** True when the caller can at least scan guests for this event. */
export async function assertEventAccess(
  req: Request,
  eventId: string,
  minimum: CalendarAdminRole = 'manager',
): Promise<{ calendarId: string; role: CalendarAdminRole }> {
  const calendarId = await calendarIdForEvent(eventId);
  if (!calendarId) throw forbidden('Event not found or not manageable.');

  const role = await assertCalendarRole(req, calendarId, minimum);
  return { calendarId, role };
}

/** Express middleware factory bound to a named route param holding a calendar id. */
export function requireCalendarRole(paramName: string, minimum: CalendarAdminRole) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const calendarId = String(req.params[paramName] ?? '');
      await assertCalendarRole(req, calendarId, minimum);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Express middleware factory bound to a named route param holding an event id. */
export function requireEventRole(paramName: string, minimum: CalendarAdminRole = 'manager') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const eventId = String(req.params[paramName] ?? '');
      await assertEventAccess(req, eventId, minimum);
      next();
    } catch (error) {
      next(error);
    }
  };
}