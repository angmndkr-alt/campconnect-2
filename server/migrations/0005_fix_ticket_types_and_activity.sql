-- Migration 0005: Clean up duplicate ticket types, add unique constraints, and add activity indexes

-- 1. Re-link guests referencing duplicate ticket types to the earliest created ticket
WITH ranked_tickets AS (
  SELECT id, event_id, lower(name) AS lower_name,
         FIRST_VALUE(id) OVER (PARTITION BY event_id, lower(name) ORDER BY created_at ASC, id ASC) AS primary_id
  FROM ticket_types
)
UPDATE guests g
SET ticket_type_id = rt.primary_id
FROM ranked_tickets rt
WHERE g.ticket_type_id = rt.id
  AND rt.id <> rt.primary_id;

-- 2. Remove duplicate ticket types keeping only the first one per event and name
DELETE FROM ticket_types
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY event_id, lower(name) ORDER BY created_at ASC, id ASC) AS rn
    FROM ticket_types
  ) t
  WHERE t.rn > 1
);

-- 3. Add unique index to ensure an event never has duplicate passes with the same name
CREATE UNIQUE INDEX IF NOT EXISTS ticket_types_event_name_unique
  ON ticket_types (event_id, lower(name));

-- 4. Ensure an authenticated student can only hold one active pass per event
CREATE UNIQUE INDEX IF NOT EXISTS guests_event_profile_active_unique
  ON guests (event_id, profile_id)
  WHERE is_invalidated = false AND profile_id IS NOT NULL;

-- 5. Add indexes to speed up activity log lookups
CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_user_idx ON activity_log (user_id);
