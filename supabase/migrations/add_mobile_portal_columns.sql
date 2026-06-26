-- Mobile command center + template save columns

ALTER TABLE event_staff_assignments
  ADD COLUMN IF NOT EXISTS late_arrival_expected_at timestamptz;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS save_as_template_checked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS template_name text;
