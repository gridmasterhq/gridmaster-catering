import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOverlay } from '../shared/AppShell'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import {
  type EventTemplate,
  EVENT_TEMPLATE_SELECT,
} from '../../lib/types/eventTemplate'
import EventTemplateCard from './EventTemplateCard'
import TemplateFilterPills from './TemplateFilterPills'

interface SaveFormState {
  templateId: string
  name: string
  description: string
}

export default function GridMasterTemplatesOverlay() {
  const { colors, labels, event_types } = useProductConfig()
  const { openOverlay, newEventPrefilledDate } = useOverlay()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [saveForm, setSaveForm] = useState<SaveFormState | null>(null)
  const [saveFormSaving, setSaveFormSaving] = useState(false)
  const [saveSuccessIds, setSaveSuccessIds] = useState<Set<string>>(new Set())

  const loadTemplates = useCallback(async (orgId: string) => {
    setLoading(true)
    setPageError(null)

    const { data, error } = await supabase
      .from('event_templates')
      .select(EVENT_TEMPLATE_SELECT)
      .eq('organization_id', orgId)
      .eq('source', 'gridmaster')
      .eq('is_active', true)
      .order('event_type', { ascending: true })
      .order('guest_count_default', { ascending: true })

    if (error) {
      console.error('Failed to load GridMaster templates:', error)
      setPageError(labels.event_templates_load_error)
      setTemplates([])
    } else {
      setTemplates((data ?? []) as EventTemplate[])
    }

    setLoading(false)
  }, [labels.event_templates_load_error])

  useEffect(() => {
    let cancelled = false

    async function init() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (cancelled || error) {
        setLoading(false)
        return
      }

      const orgId = user?.user_metadata?.organization_id
      if (typeof orgId !== 'string' || orgId.trim().length === 0) {
        setLoading(false)
        setPageError(labels.event_templates_load_error)
        return
      }

      const trimmedOrgId = orgId.trim()
      setOrganizationId(trimmedOrgId)
      await loadTemplates(trimmedOrgId)
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [labels.event_templates_load_error, loadTemplates])

  const presentEventTypes = useMemo(() => {
    const values = new Set<string>()
    for (const template of templates) {
      if (template.event_type) {
        values.add(template.event_type)
      }
    }
    return event_types
      .filter((type) => values.has(type.value))
      .map((type) => type.value)
  }, [templates, event_types])

  const filteredTemplates = useMemo(() => {
    if (selectedFilter === 'all') {
      return templates
    }
    return templates.filter((template) => template.event_type === selectedFilter)
  }, [templates, selectedFilter])

  const groupedTemplates = useMemo(() => {
    if (selectedFilter !== 'all') {
      return [{ eventType: selectedFilter, items: filteredTemplates }]
    }

    const groups = new Map<string, EventTemplate[]>()
    for (const template of filteredTemplates) {
      const key = template.event_type ?? 'other'
      const existing = groups.get(key) ?? []
      existing.push(template)
      groups.set(key, existing)
    }

    return event_types
      .filter((type) => groups.has(type.value))
      .map((type) => ({
        eventType: type.value,
        items: groups.get(type.value) ?? [],
      }))
  }, [filteredTemplates, selectedFilter, event_types])

  const eventTypeLabelMap = useMemo(
    () => new Map(event_types.map((type) => [type.value, type.label])),
    [event_types],
  )

  const handleUseTemplate = (template: EventTemplate) => {
    openOverlay('new-event', {
      mode: 'manual',
      date: newEventPrefilledDate ?? undefined,
      initialTemplate: template,
    })
  }

  const openSaveForm = (template: EventTemplate) => {
    setSaveForm({
      templateId: template.id,
      name: template.name,
      description: template.description ?? '',
    })
  }

  const closeSaveForm = () => {
    setSaveForm(null)
  }

  const handleSaveToMyTemplates = async (template: EventTemplate) => {
    if (!organizationId || !saveForm || saveForm.templateId !== template.id) {
      return
    }

    if (!saveForm.name.trim()) {
      return
    }

    setSaveFormSaving(true)

    const gridStructure = {
      ...(template.grid_structure ?? {}),
      saved_from_gridmaster: true,
      source_template_id: template.id,
    }

    const { error } = await supabase.from('event_templates').insert({
      organization_id: organizationId,
      name: saveForm.name.trim(),
      description: saveForm.description.trim() || null,
      source: 'my_templates',
      event_type: template.event_type,
      service_style: template.service_style,
      guest_count_default: template.guest_count_default,
      total_staff_needed: template.total_staff_needed,
      buffer_percent: template.buffer_percent,
      bar_service_type: template.bar_service_type,
      alcohol_cutoff: template.alcohol_cutoff,
      venue_name: template.venue_name,
      uniform_preset_id: template.uniform_preset_id,
      coordinator_notes: template.coordinator_notes,
      grid_structure: gridStructure,
    })

    setSaveFormSaving(false)

    if (error) {
      console.error('Failed to save template to My Templates:', error)
      setPageError(labels.event_templates_save_error)
      return
    }

    setSaveSuccessIds((previous) => new Set(previous).add(template.id))

    window.setTimeout(() => {
      setSaveSuccessIds((previous) => {
        const next = new Set(previous)
        next.delete(template.id)
        return next
      })
      if (saveForm?.templateId === template.id) {
        closeSaveForm()
      }
    }, 1500)
  }

  if (loading) {
    return (
      <div
        className="flex min-h-full flex-1 items-center justify-center px-4 py-6"
        style={{ backgroundColor: colors.brand_light_blue }}
      >
        <div
          className="size-10 animate-spin rounded-full border-4 border-t-transparent"
          style={{ borderColor: colors.brand_navy, borderTopColor: 'transparent' }}
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  return (
    <div
      className="min-h-full flex-1 px-4 py-6"
      style={{ backgroundColor: colors.brand_light_blue }}
    >
      <p
        className="mb-4"
        style={{ fontSize: '13px', color: colors.text_muted }}
      >
        {labels.gridmaster_templates_subtext}
      </p>

      {pageError ? (
        <p className="mb-4 text-sm text-red-500">{pageError}</p>
      ) : null}

      <TemplateFilterPills
        eventTypeValues={presentEventTypes}
        selectedFilter={selectedFilter}
        onSelectFilter={setSelectedFilter}
      />

      {groupedTemplates.map((group) => (
        <section key={group.eventType} className="mb-6">
          {selectedFilter === 'all' ? (
            <h3
              className="mb-3"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: colors.text_muted,
              }}
            >
              {eventTypeLabelMap.get(group.eventType) ?? group.eventType}
            </h3>
          ) : null}

          <ul className="flex flex-col gap-3">
            {group.items.map((template) => (
              <li key={template.id}>
                <EventTemplateCard
                  template={template}
                  variant="gridmaster"
                  saveFormOpen={saveForm?.templateId === template.id}
                  saveFormName={
                    saveForm?.templateId === template.id ? saveForm.name : ''
                  }
                  saveFormDescription={
                    saveForm?.templateId === template.id
                      ? saveForm.description
                      : ''
                  }
                  saveFormSaving={saveFormSaving}
                  saveSuccess={saveSuccessIds.has(template.id)}
                  onSaveFormNameChange={(value) =>
                    setSaveForm((previous) =>
                      previous?.templateId === template.id
                        ? { ...previous, name: value }
                        : previous,
                    )
                  }
                  onSaveFormDescriptionChange={(value) =>
                    setSaveForm((previous) =>
                      previous?.templateId === template.id
                        ? { ...previous, description: value }
                        : previous,
                    )
                  }
                  onSaveFormSubmit={() => void handleSaveToMyTemplates(template)}
                  onSaveFormCancel={closeSaveForm}
                  onUseTemplate={() => handleUseTemplate(template)}
                  onSaveToMyTemplates={() => openSaveForm(template)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {filteredTemplates.length === 0 ? (
        <p
          className="py-8 text-center text-sm"
          style={{ color: colors.text_muted }}
        >
          {labels.event_templates_no_results}
        </p>
      ) : null}
    </div>
  )
}
