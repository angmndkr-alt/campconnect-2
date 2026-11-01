/**
 * CampConnect Event Reminder Service
 *
 * Schedules and sends 24h and 2h email reminders to registered students.
 * Runs as a background process using setInterval (survives server restarts via
 * the polling architecture — the DB tracks all state).
 *
 * IST = UTC+5:30. Event `date` (DATE) and `time` (TEXT, HH:MM) are stored in
 * local IST. We convert to UTC for comparison against now().
 */

import { one, query, rows } from '../db/pool.js';
import { env } from '../env.js';
import { sendReminderEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';

const IST_OFFSET_MINUTES = 330; // UTC+5:30

/** Convert an IST date+time string to a UTC Date. */
function istToUtc(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  // Treat the date+time as IST (UTC+5:30) → subtract offset to get UTC
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMs);
}

/** Schedule reminders for a newly created / approved guest registration. */
export async function scheduleRemindersForGuest(guestId: string): Promise<void> {
  try {
    const row = await one<{
      id: string;
      email: string;
      full_name: string;
      event_id: string;
      date: string;
      time: string;
      title: string;
      venue: string | null;
      description: string | null;
      calendar_id: string;
      is_canceled: boolean;
      is_published: boolean;
      status: string;
      is_invalidated: boolean;
    }>(
      `SELECT g.id, g.email, g.full_name, g.event_id, g.status, g.is_invalidated,
              e.date::text AS date, e.time, e.title, e.venue, e.description,
              e.calendar_id, e.is_canceled, e.is_published
         FROM guests g
         JOIN events e ON e.id = g.event_id
        WHERE g.id = $1`,
      [guestId],
    );

    if (!row) return;
    if (row.is_invalidated || row.status === 'declined' || row.is_canceled || !row.is_published) return;

    const eventUtc = istToUtc(row.date, row.time);
    const now = Date.now();

    const reminders: Array<{ type: '24h' | '2h'; minutesBefore: number }> = [
      { type: '24h', minutesBefore: env.REMINDER_24H_MINUTES },
      { type: '2h', minutesBefore: env.REMINDER_2H_MINUTES },
    ];

    for (const r of reminders) {
      const scheduledFor = new Date(eventUtc.getTime() - r.minutesBefore * 60 * 1000);

      // Skip if the window has already passed
      if (scheduledFor.getTime() <= now) continue;

      // Upsert: if already scheduled (e.g. from a re-registration) update scheduled_for
      await query(
        `INSERT INTO event_reminders
           (event_id, guest_id, recipient_email, recipient_name, reminder_type, scheduled_for)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (guest_id, reminder_type) DO UPDATE
           SET scheduled_for = EXCLUDED.scheduled_for,
               status = 'scheduled',
               sent_at = NULL,
               error_message = NULL,
               updated_at = now()
           WHERE event_reminders.status <> 'sent'`,
        [row.event_id, guestId, row.email, row.full_name, r.type, scheduledFor],
      );
    }

    logger.debug({ guestId, eventId: row.event_id }, '[reminders] Reminders scheduled');
  } catch (err) {
    logger.error({ err, guestId }, '[reminders] Failed to schedule reminders');
  }
}

/** Cancel all pending reminders for a guest (when they cancel their registration). */
export async function cancelRemindersForGuest(guestId: string): Promise<void> {
  try {
    await query(
      `UPDATE event_reminders SET status = 'cancelled', updated_at = now()
        WHERE guest_id = $1 AND status = 'scheduled'`,
      [guestId],
    );
  } catch (err) {
    logger.error({ err, guestId }, '[reminders] Failed to cancel reminders');
  }
}

/** Cancel all pending reminders for an event (when the event is cancelled). */
export async function cancelRemindersForEvent(eventId: string): Promise<void> {
  try {
    await query(
      `UPDATE event_reminders SET status = 'cancelled', updated_at = now()
        WHERE event_id = $1 AND status = 'scheduled'`,
      [eventId],
    );
  } catch (err) {
    logger.error({ err, eventId }, '[reminders] Failed to cancel event reminders');
  }
}

/** Reschedule reminders when an event's date/time changes. */
export async function rescheduleRemindersForEvent(eventId: string): Promise<void> {
  try {
    const event = await one<{ date: string; time: string; is_canceled: boolean; is_published: boolean; title: string; venue: string | null; description: string | null; calendar_id: string }>(
      `SELECT date::text, time, is_canceled, is_published, title, venue, description, calendar_id FROM events WHERE id = $1`,
      [eventId],
    );
    if (!event || event.is_canceled || !event.is_published) {
      await cancelRemindersForEvent(eventId);
      return;
    }

    const eventUtc = istToUtc(event.date, event.time);
    const now = Date.now();

    const reminders: Array<{ type: '24h' | '2h'; minutesBefore: number }> = [
      { type: '24h', minutesBefore: env.REMINDER_24H_MINUTES },
      { type: '2h', minutesBefore: env.REMINDER_2H_MINUTES },
    ];

    for (const r of reminders) {
      const scheduledFor = new Date(eventUtc.getTime() - r.minutesBefore * 60 * 1000);

      if (scheduledFor.getTime() <= now) {
        // Window passed — cancel pending reminders of this type
        await query(
          `UPDATE event_reminders SET status = 'cancelled', updated_at = now()
            WHERE event_id = $1 AND reminder_type = $2 AND status = 'scheduled'`,
          [eventId, r.type],
        );
      } else {
        await query(
          `UPDATE event_reminders
              SET scheduled_for = $3, updated_at = now()
            WHERE event_id = $1 AND reminder_type = $2 AND status = 'scheduled'`,
          [eventId, r.type, scheduledFor],
        );
      }
    }

    logger.debug({ eventId }, '[reminders] Reminders rescheduled after event update');
  } catch (err) {
    logger.error({ err, eventId }, '[reminders] Failed to reschedule reminders');
  }
}

// ─── Background scheduler (polls every minute) ────────────────────────────────

type ReminderRow = {
  id: string;
  event_id: string;
  guest_id: string;
  recipient_email: string;
  recipient_name: string;
  reminder_type: '24h' | '2h';
  event_title: string;
  event_date: string;
  event_time: string;
  event_venue: string | null;
  event_description: string | null;
  club_name: string | null;
  event_slug: string | null;
};

async function processDueReminders(): Promise<void> {
  const due = await rows<ReminderRow>(
    `SELECT r.id, r.event_id, r.guest_id, r.recipient_email, r.recipient_name,
            r.reminder_type,
            e.title AS event_title, e.date::text AS event_date, e.time AS event_time,
            e.venue AS event_venue, e.description AS event_description,
            e.slug AS event_slug, e.calendar_id,
            cal.name AS club_name
       FROM event_reminders r
       JOIN events e ON e.id = r.event_id
       LEFT JOIN calendars cal ON cal.id = e.calendar_id
       JOIN guests g ON g.id = r.guest_id
      WHERE r.status = 'scheduled'
        AND r.scheduled_for <= now()
        AND e.is_canceled = false
        AND e.is_published = true
        AND g.is_invalidated = false
        AND g.status NOT IN ('declined')
      LIMIT 50`,
  );

  if (due.length === 0) return;

  logger.info({ count: due.length }, '[reminders] Processing due reminders');

  for (const reminder of due) {
    const eventUrl = `${env.PUBLIC_URL}/e/${reminder.event_slug || reminder.event_id}`;

    const result = await sendReminderEmail(reminder.recipient_email, {
      studentName: reminder.recipient_name || 'Student',
      eventTitle: reminder.event_title,
      eventDescription: reminder.event_description,
      eventDate: reminder.event_date,
      eventTime: reminder.event_time,
      eventVenue: reminder.event_venue,
      clubName: reminder.club_name || 'Campus Club',
      eventUrl,
      reminderType: reminder.reminder_type,
    });

    if (result.ok) {
      await query(
        `UPDATE event_reminders SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`,
        [reminder.id],
      );
    } else {
      await query(
        `UPDATE event_reminders SET status = 'failed', error_message = $2, updated_at = now() WHERE id = $1`,
        [reminder.id, result.error],
      );
    }
  }
}

/** Retry previously failed reminders (called by admin endpoint or scheduler). */
export async function retryFailedReminders(eventId?: string): Promise<{ retried: number }> {
  // Reset failed reminders to scheduled so the next poll picks them up
  const condition = eventId
    ? `WHERE status = 'failed' AND event_id = $1`
    : `WHERE status = 'failed'`;
  const params = eventId ? [eventId] : [];

  const res = await query(
    `UPDATE event_reminders SET status = 'scheduled', error_message = NULL, updated_at = now()
     ${condition}`,
    params,
  );

  return { retried: res.rowCount ?? 0 };
}

/** List reminders for admin view. */
export async function listReminders(params: {
  eventId?: string;
  status?: string;
  limit?: number;
}) {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.eventId) {
    values.push(params.eventId);
    conditions.push(`r.event_id = $${values.length}`);
  }
  if (params.status) {
    values.push(params.status);
    conditions.push(`r.status = $${values.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  values.push(params.limit ?? 100);

  return rows(
    `SELECT r.id, r.event_id, r.guest_id, r.recipient_email, r.recipient_name,
            r.reminder_type, r.scheduled_for, r.status, r.sent_at, r.error_message,
            r.created_at, r.updated_at,
            e.title AS event_title, e.date::text AS event_date, e.time AS event_time
       FROM event_reminders r
       JOIN events e ON e.id = r.event_id
     ${where}
     ORDER BY r.scheduled_for DESC
     LIMIT $${values.length}`,
    values,
  );
}

/** Summary stats for admin notification dashboard. */
export async function getReminderStats() {
  const res = await one<{
    total: number;
    scheduled: number;
    sent: number;
    failed: number;
    cancelled: number;
  }>(
    `SELECT
       count(*)::int AS total,
       count(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
       count(*) FILTER (WHERE status = 'sent')::int AS sent,
       count(*) FILTER (WHERE status = 'failed')::int AS failed,
       count(*) FILTER (WHERE status = 'cancelled')::int AS cancelled
     FROM event_reminders`,
  );
  return res ?? { total: 0, scheduled: 0, sent: 0, failed: 0, cancelled: 0 };
}

// ─── Scheduler startup ────────────────────────────────────────────────────────

let _schedulerStarted = false;

export function startReminderScheduler(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;

  logger.info('[reminders] Reminder scheduler started (polling every 60s)');

  // Run immediately, then every minute
  processDueReminders().catch((err) =>
    logger.error({ err }, '[reminders] Initial poll failed'),
  );

  setInterval(() => {
    processDueReminders().catch((err) =>
      logger.error({ err }, '[reminders] Poll failed'),
    );
  }, 60_000);
}
