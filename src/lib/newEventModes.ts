import type { NewEventMode } from '../components/catering/NewEventModeSelect'

export type NewEventModeKey = NewEventMode

export const NEW_EVENT_MODE_TABS = {
  quick: { id: 'quick-event', label: 'Quick Event' },
  beo: { id: 'beo-upload', label: 'BEO Upload' },
  manual: { id: 'manual-entry', label: 'Manual Entry' },
} as const satisfies Record<
  NewEventModeKey,
  { id: string; label: string }
>

export const NEW_EVENT_MODE_TAB_IDS = [
  NEW_EVENT_MODE_TABS.quick.id,
  NEW_EVENT_MODE_TABS.beo.id,
  NEW_EVENT_MODE_TABS.manual.id,
] as const

export function getNewEventModeTab(mode: NewEventModeKey) {
  return NEW_EVENT_MODE_TABS[mode]
}

export function isNewEventModeTabId(tabId: string): boolean {
  return NEW_EVENT_MODE_TAB_IDS.includes(
    tabId as (typeof NEW_EVENT_MODE_TAB_IDS)[number],
  )
}
