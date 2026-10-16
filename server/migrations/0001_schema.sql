-- ============================================================
-- CampConnect · Migration 0001 — Core schema (Luma-aligned)
-- Plain PostgreSQL 14+ — no Supabase dependencies.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Enums (idempotent) ----------
DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('student', 'club_admin', 'checkin_staff', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE calendar_admin_role AS ENUM ('owner', 'admin', 'manager', 'checkin_staff');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Luma's approval_status values: invited | pending_approval | approved | waitlist | declined
DO $$ BEGIN
  CREATE TYPE approval_status AS ENUM ('invited', 'pending_approval', 'approved', 'waitlist', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_visibility AS ENUM ('public', 'private', 'member_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_type AS ENUM ('in_person', 'online', 'hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_type AS ENUM ('free', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE question_type AS ENUM ('text', 'textarea', 'select', 'checkbox', 'number', 'terms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE blast_audience AS ENUM ('all', 'attendees', 'waitlist', 'not_going');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE checkin_method AS ENUM ('qr_scan', 'manual', 'self');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Profiles (app users; replaces auth.users) ----------
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                TEXT NOT NULL,
  password_hash        TEXT NOT NULL,
  full_name            TEXT NOT NULL,
  avatar_url           TEXT,
  department           TEXT,
  year_or_designation  TEXT,
  role                 app_role NOT NULL DEFAULT 'student',
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  last_login_at        TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Case-insensitive unique email without requiring the citext extension.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_key ON profiles (lower(email));

-- ---------- Sessions (revocable refresh tokens) ----------
CREATE TABLE IF NOT EXISTS sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  user_agent         TEXT,
  ip_address         TEXT,
  expires_at         TIMESTAMPTZ NOT NULL,
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

-- ---------- Password reset tokens ----------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens (user_id);

-- ---------- Calendars (a club = a team calendar) ----------
CREATE TABLE IF NOT EXISTS calendars (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT 'CC',
  tone          TEXT NOT NULL DEFAULT 'mint',
  blurb         TEXT,
  cover_url     TEXT,
  members_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Calendar admins (roles: owner/admin/manager/checkin_staff) ----------
CREATE TABLE IF NOT EXISTS calendar_admins (
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        calendar_admin_role NOT NULL DEFAULT 'admin',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (calendar_id, profile_id)
);

-- ---------- Events ----------
CREATE TABLE IF NOT EXISTS events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id       TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  owner_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  category          TEXT NOT NULL DEFAULT 'Cultural',
  description       TEXT,
  event_type        event_type NOT NULL DEFAULT 'in_person',
  visibility        event_visibility NOT NULL DEFAULT 'public',
  date              DATE NOT NULL,
  end_date          DATE,
  time              TEXT NOT NULL,
  end_time          TEXT,
  timezone          TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  venue             TEXT NOT NULL DEFAULT '',
  online_url        TEXT,
  xp                INTEGER NOT NULL DEFAULT 80,
  tone              TEXT NOT NULL DEFAULT 'mint',
  cover_url         TEXT,
  max_capacity      INTEGER,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  waitlist_enabled  BOOLEAN NOT NULL DEFAULT true,
  is_published      BOOLEAN NOT NULL DEFAULT true,
  is_canceled       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_calendar_idx ON events (calendar_id);
CREATE INDEX IF NOT EXISTS events_date_idx ON events (date);

-- ---------- Event hosts (display only) ----------
CREATE TABLE IF NOT EXISTS event_hosts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  role       TEXT,
  avatar_url TEXT
);

-- ---------- Ticket types ----------
CREATE TABLE IF NOT EXISTS ticket_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name              TEXT NOT NULL DEFAULT 'Standard',
  description       TEXT,
  payment_type      payment_type NOT NULL DEFAULT 'free',
  price_cents       INTEGER NOT NULL DEFAULT 0,
  currency          TEXT NOT NULL DEFAULT 'INR',
  capacity          INTEGER,
  min_per_order     INTEGER NOT NULL DEFAULT 1,
  max_per_order     INTEGER NOT NULL DEFAULT 4,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  is_hidden         BOOLEAN NOT NULL DEFAULT false,
  sales_start       TIMESTAMPTZ,
  sales_end         TIMESTAMPTZ,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_types_event_idx ON ticket_types (event_id);

-- ---------- Registration questions ----------
CREATE TABLE IF NOT EXISTS registration_questions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type question_type NOT NULL DEFAULT 'text',
  required      BOOLEAN NOT NULL DEFAULT false,
  options       JSONB,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS registration_questions_event_idx ON registration_questions (event_id);

-- ---------- Guests (a registration = one ticket, like Luma) ----------
CREATE TABLE IF NOT EXISTS guests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  ticket_type_id UUID REFERENCES ticket_types(id) ON DELETE SET NULL,
  profile_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  full_name      TEXT NOT NULL,
  email          TEXT NOT NULL,
  phone          TEXT,
  department     TEXT,
  year           TEXT,
  status         approval_status NOT NULL DEFAULT 'approved',
  qr_token       TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  note           TEXT,
  checked_in_at  TIMESTAMPTZ,
  is_invalidated BOOLEAN NOT NULL DEFAULT false,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS guests_event_idx ON guests (event_id);
CREATE INDEX IF NOT EXISTS guests_email_idx ON guests (lower(email));
CREATE INDEX IF NOT EXISTS guests_status_idx ON guests (event_id, status);
-- One active registration per email per event (Luma prevents duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS guests_event_email_active_key
  ON guests (event_id, lower(email))
  WHERE is_invalidated = false;
-- ---------- Registration answers ----------
CREATE TABLE IF NOT EXISTS registration_answers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id    UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES registration_questions(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guest_id, question_id)
);

-- ---------- Check-ins (attendance log; guests.checked_in_at is the rollup) ----------
CREATE TABLE IF NOT EXISTS check_ins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id      UUID NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  checked_in_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  method        checkin_method NOT NULL DEFAULT 'qr_scan',
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_ins_event_idx ON check_ins (event_id);
CREATE INDEX IF NOT EXISTS check_ins_guest_idx ON check_ins (guest_id);

-- ---------- Blasts (emails/notifications to guests) ----------
CREATE TABLE IF NOT EXISTS blasts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID REFERENCES events(id) ON DELETE CASCADE,
  calendar_id     TEXT REFERENCES calendars(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  subject         TEXT NOT NULL,
  message_body    TEXT NOT NULL,
  audience        blast_audience NOT NULL DEFAULT 'all',
  recipient_count INTEGER NOT NULL DEFAULT 0,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Announcements (in-app student notifications) ----------
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  tone        TEXT NOT NULL DEFAULT 'mint',
  audience    TEXT NOT NULL DEFAULT 'All students',
  calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS announcements_created_idx ON announcements (created_at DESC);

-- ---------- Chat ----------
CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id      UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_name     TEXT NOT NULL,
  sender_initials TEXT NOT NULL,
  sender_tone     TEXT NOT NULL DEFAULT 'mint',
  is_admin        BOOLEAN NOT NULL DEFAULT false,
  club_name       TEXT,
  text            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_channel_idx ON messages (channel_id, created_at DESC);

-- ---------- Gallery ----------
CREATE TABLE IF NOT EXISTS albums (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id TEXT REFERENCES calendars(id) ON DELETE SET NULL,
  owner_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  event_name  TEXT,
  date        TEXT NOT NULL,
  description TEXT,
  posted_by   TEXT NOT NULL,
  cover_url   TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS album_photos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id   UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_url  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Follows ----------
CREATE TABLE IF NOT EXISTS follows (
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  calendar_id TEXT NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, calendar_id)
);

-- ---------- Activity log ----------
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  calendar_id TEXT REFERENCES calendars(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_log_calendar_idx ON activity_log (calendar_id, created_at DESC);