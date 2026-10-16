CREATE TABLE IF NOT EXISTS sports_teams (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
 captain_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 players JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(event_id,captain_id)
);
