ALTER TABLE staff_certifications
  ADD COLUMN IF NOT EXISTS is_alcohol_cert boolean NOT NULL DEFAULT false;
