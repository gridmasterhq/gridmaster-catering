-- Quick Event form columns on events

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS client_name text,
  ADD COLUMN IF NOT EXISTS venue_name text,
  ADD COLUMN IF NOT EXISTS total_staff_needed integer;
