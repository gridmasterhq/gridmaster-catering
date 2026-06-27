export interface EventTemplate {
  id: string
  organization_id: string
  name: string
  description: string | null
  source: 'my_templates' | 'gridmaster'
  event_type: string | null
  service_style: string | null
  guest_count_default: number | null
  total_staff_needed: number | null
  buffer_percent: number | null
  bar_service_type: string | null
  alcohol_cutoff: string | null
  venue_name: string | null
  uniform_preset_id: string | null
  coordinator_notes: string | null
  grid_structure: Record<string, unknown> | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export const EVENT_TEMPLATE_SELECT =
  'id, organization_id, name, description, source, event_type, service_style, guest_count_default, total_staff_needed, buffer_percent, bar_service_type, alcohol_cutoff, venue_name, uniform_preset_id, coordinator_notes, grid_structure, is_active, created_at, updated_at'

export function isSavedFromGridmaster(template: EventTemplate): boolean {
  if (!template.grid_structure) {
    return false
  }
  return template.grid_structure.saved_from_gridmaster === true
}
