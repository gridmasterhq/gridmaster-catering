CREATE TABLE public.action_item_archives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  event_date DATE,
  reason TEXT,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_by TEXT,
  retention_until TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.action_item_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access_action_item_archives" ON public.action_item_archives
  FOR ALL USING (
    organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
  );

GRANT SELECT, INSERT, DELETE ON public.action_item_archives TO authenticated;
