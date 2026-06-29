CREATE TABLE public.action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  category TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'normal')),
  deep_link TEXT NOT NULL,
  auto_resolves BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, category, entity_type, entity_id)
);

ALTER TABLE public.action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access_action_items" ON public.action_items
  FOR ALL USING (
    organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.action_items TO authenticated;
