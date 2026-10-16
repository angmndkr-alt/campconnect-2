-- ============================================================
-- CampConnect · Migration 0002 — Functions & triggers
-- ============================================================

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_guests_updated_at ON guests;
CREATE TRIGGER trg_guests_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Attendance rollup: guests.checked_in_at mirrors the check_ins log,
-- exactly like Luma (check-in is a ticket timestamp, not a status).
CREATE OR REPLACE FUNCTION sync_guest_check_in()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE guests
       SET checked_in_at = COALESCE(checked_in_at, NEW.checked_in_at)
     WHERE id = NEW.guest_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    UPDATE guests g
       SET checked_in_at = (
         SELECT max(c.checked_in_at) FROM check_ins c WHERE c.guest_id = OLD.guest_id
       )
     WHERE g.id = OLD.guest_id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_ins_sync ON check_ins;
CREATE TRIGGER trg_check_ins_sync
  AFTER INSERT OR DELETE ON check_ins
  FOR EACH ROW EXECUTE FUNCTION sync_guest_check_in();

-- Denormalised member counts stay truthful.
CREATE OR REPLACE FUNCTION refresh_calendar_member_count(p_calendar_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE calendars c
     SET members_count = (
       SELECT count(*) FROM follows f WHERE f.calendar_id = p_calendar_id
     )
   WHERE c.id = p_calendar_id;
END;
$$ LANGUAGE plpgsql;

-- ---- Views used by the dashboard / insights endpoints ----

-- Guest list with ticket info and derived Luma-style flags.
CREATE OR REPLACE VIEW guest_details AS
SELECT
  g.id,
  g.event_id,
  g.ticket_type_id,
  g.profile_id,
  g.full_name,
  g.email,
  g.phone,
  g.department,
  g.year,
  g.status,
  g.qr_token,
  g.note,
  g.checked_in_at,
  g.is_invalidated,
  g.registered_at,
  g.updated_at,
  tt.name        AS ticket_name,
  tt.payment_type,
  tt.price_cents,
  (g.checked_in_at IS NOT NULL)                       AS is_checked_in,
  (g.status = 'approved' AND g.checked_in_at IS NULL) AS is_not_checked_in
FROM guests g
LEFT JOIN ticket_types tt ON tt.id = g.ticket_type_id;

-- Per-event rollup used by the guests tab counters.
CREATE OR REPLACE VIEW event_guest_stats AS
SELECT
  e.id AS event_id,
  count(*) FILTER (WHERE g.status = 'approved')         AS going_count,
  count(*) FILTER (WHERE g.status = 'pending_approval') AS pending_count,
  count(*) FILTER (WHERE g.status = 'waitlist')         AS waitlist_count,
  count(*) FILTER (WHERE g.status = 'invited')          AS invited_count,
  count(*) FILTER (WHERE g.status = 'declined')         AS declined_count,
  count(*) FILTER (WHERE g.checked_in_at IS NOT NULL)   AS checked_in_count,
  count(*) FILTER (WHERE g.status = 'approved'
                     AND g.checked_in_at IS NULL)       AS not_checked_in_count,
  count(*)                                              AS total_count
FROM events e
LEFT JOIN guests g ON g.event_id = e.id AND g.is_invalidated = false
GROUP BY e.id;