CREATE TABLE IF NOT EXISTS custom_selection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  field_name text NOT NULL,
  selected_value text,
  custom_text text,
  event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS custom_selection_events_organization_id_idx
  ON custom_selection_events (organization_id);

CREATE INDEX IF NOT EXISTS custom_selection_events_field_name_idx
  ON custom_selection_events (field_name);

CREATE INDEX IF NOT EXISTS custom_selection_events_event_id_idx
  ON custom_selection_events (event_id);

ALTER TABLE custom_selection_events
  ADD COLUMN IF NOT EXISTS event_id uuid;

ALTER TABLE custom_selection_events
  ALTER COLUMN selected_value DROP NOT NULL;
