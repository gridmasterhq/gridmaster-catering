-- Schema Patch v2: check-in / check-out columns

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS checkout_code text;

ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS checkin_method text NOT NULL DEFAULT 'geofence',
  ADD COLUMN IF NOT EXISTS geofence_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gps_failure_reason text,
  ADD COLUMN IF NOT EXISTS captain_override_by text,
  ADD COLUMN IF NOT EXISTS captain_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS captain_sms_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS venue_failure_flag boolean NOT NULL DEFAULT false;

ALTER TABLE check_outs
  ADD COLUMN IF NOT EXISTS checkout_method text NOT NULL DEFAULT 'code',
  ADD COLUMN IF NOT EXISTS supervisor_confirmed_by text,
  ADD COLUMN IF NOT EXISTS supervisor_confirmed_at timestamptz;

CREATE OR REPLACE FUNCTION validate_checkout_code(
  p_event_id uuid,
  p_organization_id uuid,
  p_entered_code text
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM events
    WHERE id = p_event_id
      AND organization_id = p_organization_id
      AND checkout_code = p_entered_code
  );
$$;

REVOKE ALL ON FUNCTION validate_checkout_code(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION validate_checkout_code(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_checkout_code(uuid, uuid, text) TO anon;
