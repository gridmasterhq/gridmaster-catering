import { supabase } from './supabase'
import type { EventTemplateSourceData } from './types/eventTemplate'

export function buildDefaultTemplateDescription(
  eventTypeLabel: string | null | undefined,
  serviceStyleLabel: string | null | undefined,
): string {
  if (eventTypeLabel && serviceStyleLabel) {
    return `${eventTypeLabel} · ${serviceStyleLabel}`
  }
  return ''
}

export async function insertMyEventTemplate(
  source: EventTemplateSourceData,
  name: string,
  description: string | null,
): Promise<{ error: unknown | null }> {
  const { error } = await supabase.from('event_templates').insert({
    organization_id: source.organization_id,
    name: name.trim(),
    description: description?.trim() || null,
    source: 'my_templates',
    event_type: source.event_type,
    service_style: source.service_style,
    guest_count_default: source.guest_count,
    total_staff_needed: source.total_staff_needed,
    buffer_percent: 15,
    bar_service_type: source.bar_service_type,
    alcohol_cutoff: source.alcohol_cutoff,
    venue_name: source.venue_name,
    coordinator_notes: source.coordinator_notes,
    uniform_preset_id: source.uniform_preset_id,
    grid_structure: null,
  })

  return { error }
}
