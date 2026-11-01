-- Migration 0006: Add status column to albums for photo approval workflow and remove specific image
ALTER TABLE albums ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
CREATE INDEX IF NOT EXISTS albums_status_idx ON albums (status, created_at DESC);

-- Ensure profiles has department column (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department TEXT;

-- Remove the specific image from the gallery (posted by Angel Mandaokar, title "Your campus moment")
DELETE FROM albums
 WHERE lower(posted_by) = 'angel mandaokar'
   AND title = 'Your campus moment';
