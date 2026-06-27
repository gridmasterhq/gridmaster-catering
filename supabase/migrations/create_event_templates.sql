CREATE TABLE public.event_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('my_templates', 'gridmaster')),
  event_type TEXT,
  service_style TEXT,
  guest_count_default INTEGER,
  total_staff_needed INTEGER,
  buffer_percent INTEGER DEFAULT 15,
  bar_service_type TEXT,
  alcohol_cutoff TEXT,
  venue_name TEXT,
  uniform_preset_id UUID REFERENCES public.uniform_presets(id),
  coordinator_notes TEXT,
  grid_structure JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.event_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_access_templates" ON public.event_templates
  FOR ALL USING (
    organization_id = (auth.jwt()->'user_metadata'->>'organization_id')::uuid
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_templates TO authenticated;

INSERT INTO public.event_templates (
  organization_id,
  name,
  description,
  source,
  event_type,
  service_style,
  guest_count_default,
  total_staff_needed,
  buffer_percent,
  bar_service_type
) VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Corporate Lunch — Up to 50 Guests',
    'Standard corporate lunch setup with buffet service',
    'gridmaster',
    'corporate',
    'buffet',
    50,
    6,
    10,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Corporate Dinner — Up to 100 Guests',
    'Formal plated corporate dinner',
    'gridmaster',
    'corporate',
    'plated',
    100,
    14,
    15,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Wedding Reception — Up to 150 Guests',
    'Full wedding reception with bar service',
    'gridmaster',
    'wedding',
    'plated',
    150,
    20,
    15,
    'full_bar'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Wedding Reception — Up to 250 Guests',
    'Large wedding reception with full bar and cocktail hour',
    'gridmaster',
    'wedding',
    'plated',
    250,
    32,
    15,
    'full_bar'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Gala & Fundraiser — Up to 200 Guests',
    'Formal gala with plated dinner and bar service',
    'gridmaster',
    'gala_fundraiser',
    'plated',
    200,
    26,
    15,
    'full_bar'
  ),
  (
    '00000000-0000-0000-0000-000000000001',
    'Cocktail Reception — Up to 75 Guests',
    'Casual cocktail reception with passed appetizers',
    'gridmaster',
    'simple',
    'cocktail',
    75,
    8,
    10,
    NULL
  );
