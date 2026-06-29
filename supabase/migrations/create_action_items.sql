CREATE TABLE public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  staff_phone TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'staff_compliance',
  title TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'normal')),
  deep_link TEXT NOT NULL,
  reference_key TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, staff_phone, issue_type, reference_key)
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access_action_items" ON public.action_items
  FOR ALL USING (
    organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;
