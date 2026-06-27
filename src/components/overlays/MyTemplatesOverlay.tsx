import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { IconCopy } from '@tabler/icons-react'
import { useOverlay } from '../shared/AppShell'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import {
  type EventTemplate,
  EVENT_TEMPLATE_SELECT,
} from '../../lib/types/eventTemplate'
import EventTemplateCard from './EventTemplateCard'
import TemplateFilterPills from './TemplateFilterPills'

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none'

export default function MyTemplatesOverlay() {
  const { colors, labels, event_types } = useProductConfig()
  const { openOverlay, newEventPrefilledDate } = useOverlay()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EventTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const eventTypeLabelMap = useMemo(
    () => new Map(event_types.map((type) => [type.value, type.label])),
    [event_types],
  )

  const loadTemplates = useCallback(async (orgId: string) => {
    setLoading(true)
    setPageError(null)

    const { data, error } = await supabase
      .from('event_templates')
      .select(EVENT_TEMPLATE_SELECT)
      .eq('organization_id', orgId)
      .eq('source', 'my_templates')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Failed to load my templates:', error)
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
    const query = searchQuery.trim().toLowerCase()

    return templates.filter((template) => {
      if (selectedFilter !== 'all' && template.event_type !== selectedFilter) {
        return false
      }

      if (!query) {
        return true
      }

      const nameMatch = template.name.toLowerCase().includes(query)
      const typeLabel = template.event_type
        ? (eventTypeLabelMap.get(template.event_type) ?? template.event_type)
        : ''
      const typeMatch = typeLabel.toLowerCase().includes(query)

      return nameMatch || typeMatch
    })
  }, [templates, searchQuery, selectedFilter, eventTypeLabelMap])

  const handleUseTemplate = (template: EventTemplate) => {
    openOverlay('new-event', {
      mode: 'manual',
      date: newEventPrefilledDate ?? undefined,
      initialTemplate: template,
    })
  }

  const handleDelete = async (template: EventTemplate) => {
    if (!organizationId) {
      return
    }

    if (!window.confirm(labels.event_templates_delete_confirm)) {
      return
    }

    const { error } = await supabase
      .from('event_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', template.id)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Failed to delete template:', error)
      setPageError(labels.event_templates_delete_error)
      return
    }

    if (editingId === template.id) {
      setEditingId(null)
    }

    await loadTemplates(organizationId)
  }

  const openEditForm = (template: EventTemplate) => {
    setEditingId(template.id)
    setEditName(template.name)
    setEditDescription(template.description ?? '')
  }

  const handleEditSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!organizationId || !editingId || !editName.trim()) {
      return
    }

    setIsSavingEdit(true)

    const { error } = await supabase
      .from('event_templates')
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingId)
      .eq('organization_id', organizationId)

    setIsSavingEdit(false)

    if (error) {
      console.error('Failed to update template:', error)
      setPageError(labels.event_templates_save_error)
      return
    }

    setEditingId(null)
    await loadTemplates(organizationId)
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
      {pageError ? (
        <p className="mb-4 text-sm text-red-500">{pageError}</p>
      ) : null}

      {templates.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-12 text-center">
          <IconCopy size={48} color={colors.brand_navy} stroke={1.5} />
          <p
            className="mt-4"
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {labels.event_templates_empty_headline}
          </p>
          <p
            className="mt-2 max-w-sm"
            style={{ fontSize: '13px', color: colors.text_muted }}
          >
            {labels.event_templates_empty_subtext}
          </p>
          <button
            type="button"
            onClick={() => openOverlay('gridmaster-templates')}
            className="mt-6 text-sm font-semibold hover:underline"
            style={{ color: colors.brand_navy }}
          >
            {labels.event_templates_browse_gridmaster}
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={labels.event_templates_search_placeholder}
            className={`${inputClassName} mb-4`}
          />

          <TemplateFilterPills
            eventTypeValues={presentEventTypes}
            selectedFilter={selectedFilter}
            onSelectFilter={setSelectedFilter}
          />

          <ul className="flex flex-col gap-3">
            {filteredTemplates.map((template) => (
              <li key={template.id}>
                {editingId === template.id ? (
                  <form
                    onSubmit={handleEditSave}
                    className="rounded-lg border border-gray-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-3">
                      <div>
                        <label
                          htmlFor={`edit-template-name-${template.id}`}
                          className="mb-1 block"
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: colors.brand_navy,
                          }}
                        >
                          Template name
                        </label>
                        <input
                          id={`edit-template-name-${template.id}`}
                          type="text"
                          value={editName}
                          onChange={(event) => setEditName(event.target.value)}
                          disabled={isSavingEdit}
                          className={inputClassName}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`edit-template-description-${template.id}`}
                          className="mb-1 block"
                          style={{
                            fontSize: '13px',
                            fontWeight: 500,
                            color: colors.brand_navy,
                          }}
                        >
                          Description (optional)
                        </label>
                        <textarea
                          id={`edit-template-description-${template.id}`}
                          value={editDescription}
                          onChange={(event) =>
                            setEditDescription(event.target.value)
                          }
                          disabled={isSavingEdit}
                          rows={2}
                          className={inputClassName}
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="submit"
                          disabled={isSavingEdit || !editName.trim()}
                          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                          style={{ backgroundColor: colors.brand_navy }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          disabled={isSavingEdit}
                          className="text-sm hover:underline"
                          style={{ color: colors.text_muted }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <EventTemplateCard
                    template={template}
                    variant="my_templates"
                    showGridMasterBadge
                    onCardClick={() => handleUseTemplate(template)}
                    onEdit={() => openEditForm(template)}
                    onDelete={() => void handleDelete(template)}
                  />
                )}
              </li>
            ))}
          </ul>

          {filteredTemplates.length === 0 ? (
            <p
              className="py-8 text-center text-sm"
              style={{ color: colors.text_muted }}
            >
              {labels.event_templates_no_results}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
