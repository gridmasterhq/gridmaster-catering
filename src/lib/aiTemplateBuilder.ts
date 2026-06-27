import { supabase } from './supabase'
import {
  type EventTemplate,
  EVENT_TEMPLATE_SELECT,
} from './types/eventTemplate'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

export const AI_TEMPLATE_BUILDER_SYSTEM_PROMPT = `You are the GridMaster AI Template Builder — an assistant that helps catering coordinators build reusable event staffing templates.
Your job is to gather the following information through conversation:

event_type (wedding, corporate, social, gala_fundraiser, holiday_party, simple, delivery, custom)
service_style (plated, buffet, cocktail, stations, family_style, passed_only, custom)
guest_count_default (number)
total_staff_needed (number)
bar_service_type (full_bar, beer_wine_only, soft_drinks_only, no_bar, custom) — optional
venue_name — optional, only if recurring at a specific venue
coordinator_notes — any special notes the coordinator mentions
A suggested template name (friendly, descriptive, e.g. "Saturday Wedding — 150 Guests Plated")
A short description (1 sentence)

In guided mode, ask one question at a time. Be conversational and brief. Don't ask for information already provided.
In freeform mode, extract what you can from the coordinator's description, then ask only about the missing required fields (event_type, guest_count_default, total_staff_needed).
When you have all required fields (event_type, guest_count_default, total_staff_needed), end your message with this exact marker on its own line:

TEMPLATE_READY
Then on the next lines output ONLY valid JSON (no markdown, no backticks):

{
  "name": "...",
  "description": "...",
  "event_type": "...",
  "service_style": "...",
  "guest_count_default": 0,
  "total_staff_needed": 0,
  "bar_service_type": "...",
  "venue_name": "...",
  "coordinator_notes": "..."
}

Do not include TEMPLATE_READY or the JSON until you have all required fields. Optional fields can be null if not provided.`

export interface AIGeneratedTemplate {
  name: string
  description: string | null
  event_type: string | null
  service_style: string | null
  guest_count_default: number
  total_staff_needed: number
  bar_service_type: string | null
  venue_name: string | null
  coordinator_notes: string | null
}

export interface AnthropicChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ParsedTemplateResponse {
  displayText: string
  template: AIGeneratedTemplate | null
}

const BAR_SERVICE_ALIASES: Record<string, string> = {
  beer_wine_only: 'beer_wine',
  soft_drinks_only: 'soft_drinks',
}

const SERVICE_STYLE_ALIASES: Record<string, string> = {
  passed_only: 'cocktail',
}

function normalizeBarServiceType(value: string | null | undefined): string | null {
  if (!value || value === 'null') {
    return null
  }
  return BAR_SERVICE_ALIASES[value] ?? value
}

function normalizeServiceStyle(value: string | null | undefined): string | null {
  if (!value || value === 'null') {
    return null
  }
  return SERVICE_STYLE_ALIASES[value] ?? value
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') {
    return null
  }
  return trimmed
}

export function parseTemplateBuilderResponse(raw: string): ParsedTemplateResponse {
  const markerIndex = raw.indexOf('TEMPLATE_READY')
  if (markerIndex === -1) {
    return { displayText: raw.trim(), template: null }
  }

  const displayText = raw.slice(0, markerIndex).trim()
  const jsonSection = raw.slice(markerIndex + 'TEMPLATE_READY'.length).trim()

  try {
    const parsed = JSON.parse(jsonSection) as Record<string, unknown>
    const template: AIGeneratedTemplate = {
      name: typeof parsed.name === 'string' ? parsed.name.trim() : 'Untitled Template',
      description: normalizeOptionalString(parsed.description),
      event_type: normalizeOptionalString(parsed.event_type),
      service_style: normalizeServiceStyle(normalizeOptionalString(parsed.service_style)),
      guest_count_default:
        typeof parsed.guest_count_default === 'number'
          ? parsed.guest_count_default
          : Number.parseInt(String(parsed.guest_count_default ?? '0'), 10),
      total_staff_needed:
        typeof parsed.total_staff_needed === 'number'
          ? parsed.total_staff_needed
          : Number.parseInt(String(parsed.total_staff_needed ?? '0'), 10),
      bar_service_type: normalizeBarServiceType(
        normalizeOptionalString(parsed.bar_service_type),
      ),
      venue_name: normalizeOptionalString(parsed.venue_name),
      coordinator_notes: normalizeOptionalString(parsed.coordinator_notes),
    }

    return { displayText, template }
  } catch (error) {
    console.error('Failed to parse AI template JSON:', error)
    return { displayText, template: null }
  }
}

export async function callTemplateBuilderApi(
  messages: AnthropicChatMessage[],
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing VITE_ANTHROPIC_API_KEY')
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1000,
      system: AI_TEMPLATE_BUILDER_SYSTEM_PROMPT,
      messages,
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(errorBody || `Anthropic API error: ${response.status}`)
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }

  const textBlock = payload.content?.find(
    (block) => block.type === 'text' && typeof block.text === 'string',
  )

  if (!textBlock?.text) {
    throw new Error('No text content in Anthropic response')
  }

  return textBlock.text
}

export async function insertAiGeneratedTemplate(
  organizationId: string,
  template: AIGeneratedTemplate,
): Promise<{ data: EventTemplate | null; error: unknown | null }> {
  const { data, error } = await supabase
    .from('event_templates')
    .insert({
      organization_id: organizationId,
      name: template.name.trim(),
      description: template.description,
      source: 'my_templates',
      event_type: template.event_type,
      service_style: template.service_style,
      guest_count_default: template.guest_count_default,
      total_staff_needed: template.total_staff_needed,
      buffer_percent: 15,
      bar_service_type: template.bar_service_type,
      venue_name: template.venue_name,
      coordinator_notes: template.coordinator_notes,
      grid_structure: { created_by: 'ai_template_builder' },
    })
    .select(EVENT_TEMPLATE_SELECT)
    .single()

  return { data: (data as EventTemplate | null) ?? null, error }
}

export function aiTemplateToEventTemplate(
  organizationId: string,
  template: AIGeneratedTemplate,
  saved?: EventTemplate | null,
): EventTemplate {
  if (saved) {
    return saved
  }

  const now = new Date().toISOString()
  return {
    id: '00000000-0000-0000-0000-000000000000',
    organization_id: organizationId,
    name: template.name,
    description: template.description,
    source: 'my_templates',
    event_type: template.event_type,
    service_style: template.service_style,
    guest_count_default: template.guest_count_default,
    total_staff_needed: template.total_staff_needed,
    buffer_percent: 15,
    bar_service_type: template.bar_service_type,
    alcohol_cutoff: null,
    venue_name: template.venue_name,
    uniform_preset_id: null,
    coordinator_notes: template.coordinator_notes,
    grid_structure: { created_by: 'ai_template_builder' },
    is_active: true,
    created_at: now,
    updated_at: now,
  }
}
