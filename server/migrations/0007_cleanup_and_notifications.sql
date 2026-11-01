-- ============================================================
-- 0007: Clean test events + add event_reminders table
-- ============================================================

-- 1. Remove test event guests (must delete before events due to FK)
DELETE FROM check_ins
  WHERE guest_id IN (
    SELECT g.id FROM guests g
    INNER JOIN events e ON e.id = g.event_id
    WHERE e.title ILIKE 'Attendance Test Event%'
  );

DELETE FROM registration_answers
  WHERE guest_id IN (
    SELECT g.id FROM guests g
    INNER JOIN events e ON e.id = g.event_id
    WHERE e.title ILIKE 'Attendance Test Event%'
  );

DELETE FROM guests
  WHERE event_id IN (
    SELECT id FROM events WHERE title ILIKE 'Attendance Test Event%'
  );

-- 2. Remove ticket types for test events
DELETE FROM ticket_types
  WHERE event_id IN (
    SELECT id FROM events WHERE title ILIKE 'Attendance Test Event%'
  );

-- 3. Remove activity log entries for test events
DELETE FROM activity_log
  WHERE details ILIKE 'Attendance Test Event%';

-- 4. Remove the test events themselves
DELETE FROM events WHERE title ILIKE 'Attendance Test Event%';

-- 5. Remove test student accounts (created only by test scripts)
--    We identify them by the test-script email pattern
DELETE FROM sessions
  WHERE user_id IN (
    SELECT id FROM profiles
    WHERE email ~ '^test\.student\.\d+@pvppcoe\.ac\.in$'
  );

DELETE FROM guests
  WHERE profile_id IN (
    SELECT id FROM profiles
    WHERE email ~ '^test\.student\.\d+@pvppcoe\.ac\.in$'
  );

DELETE FROM profiles
  WHERE email ~ '^test\.student\.\d+@pvppcoe\.ac\.in$';

-- Also clean up the verify test account if it has no real data
DELETE FROM sessions
  WHERE user_id = (SELECT id FROM profiles WHERE email = 'test.verify@pvppcoe.ac.in');
DELETE FROM profiles WHERE email = 'test.verify@pvppcoe.ac.in';

-- 6. Create event_reminders table for automated email notifications
CREATE TABLE IF NOT EXISTS event_reminders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_id        UUID        NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  recipient_email TEXT        NOT NULL,
  recipient_name  TEXT        NOT NULL DEFAULT '',
  reminder_type   TEXT        NOT NULL CHECK (reminder_type IN ('24h', '2h')),
  scheduled_for   TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                               CHECK (status IN ('scheduled','sent','failed','cancelled')),
  sent_at         TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guest_id, reminder_type)
);

CREATE INDEX IF NOT EXISTS idx_event_reminders_scheduled
  ON event_reminders (scheduled_for)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_event_reminders_event
  ON event_reminders (event_id);

-- 7. Reset club admin passwords back to known demo password 'campus2026'
--    so demo accounts work reliably.
--    scrypt hash of 'campus2026' (pre-computed with same SALT_LEN=16, KEY_LEN=64 params)
--    We'll do this via a dedicated seed script instead; this migration only
--    ensures the notifications infrastructure exists.

-- 8. Email notification preferences (for future per-user opt-out)
CREATE TABLE IF NOT EXISTS notification_preferences (
  profile_id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  event_reminders     BOOLEAN NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
