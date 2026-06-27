import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

interface NoteTemplate {
  id: string
  organization_id: string
  name: string
  description: string
  event_type: string | null
  sort_order: number
}

type FormMode = 'add' | 'edit' | null

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none'

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return fallback
}

export default function NoteTemplatesPage() {
  const { labels, colors, event_types } = useProductConfig()

  const eventTypeLabelMap = useMemo(
    () => new Map(event_types.map((type) => [type.value, type.label])),
    [event_types],
  )

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [templates, setTemplates] = useState<NoteTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState('')
  const [description, setDescription] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; description?: string }>(
    {},
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.brand_navy,
  } as const

  const loadTemplates = useCallback(
    async (orgId: string) => {
      setLoading(true)
      setPageError(null)

      const { data, error } = await supabase
        .from('note_templates')
        .select('id, organization_id, name, description, event_type, sort_order')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        console.error('Failed to load note templates:', error)
        setPageError(labels.note_templates_load_error)
        setTemplates([])
      } else {
        setTemplates(data ?? [])
      }

      setLoading(false)
    },
    [labels.note_templates_load_error],
  )

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
        setPageError(labels.note_templates_load_error)
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
  }, [labels.note_templates_load_error, loadTemplates])

  const resetForm = () => {
    setFormMode(null)
    setEditingId(null)
    setName('')
    setEventType('')
    setDescription('')
    setFieldErrors({})
    setFormError(null)
  }

  const openAddForm = () => {
    setFormMode('add')
    setEditingId(null)
    setName('')
    setEventType('')
    setDescription('')
    setFieldErrors({})
    setFormError(null)
  }

  const openEditForm = (template: NoteTemplate) => {
    setFormMode('edit')
    setEditingId(template.id)
    setName(template.name)
    setEventType(template.event_type ?? '')
    setDescription(template.description)
    setFieldErrors({})
    setFormError(null)
  }

  const validateForm = (): boolean => {
    const next: { name?: string; description?: string } = {}
    const required = labels.note_templates_field_required

    if (!name.trim()) {
      next.name = required
    }
    if (!description.trim()) {
      next.description = required
    }

    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    if (!validateForm() || !organizationId) {
      return
    }

    setIsSaving(true)

    try {
      const trimmedName = name.trim()
      const trimmedDescription = description.trim()
      const eventTypeValue = eventType || null

      if (formMode === 'edit' && editingId) {
        const { error } = await supabase
          .from('note_templates')
          .update({
            name: trimmedName,
            description: trimmedDescription,
            event_type: eventTypeValue,
          })
          .eq('id', editingId)
          .eq('organization_id', organizationId)

        if (error) {
          throw error
        }
      } else {
        const nextSortOrder =
          templates.length > 0
            ? Math.max(...templates.map((template) => template.sort_order)) + 1
            : 0

        const { error } = await supabase.from('note_templates').insert({
          organization_id: organizationId,
          name: trimmedName,
          description: trimmedDescription,
          event_type: eventTypeValue,
          sort_order: nextSortOrder,
        })

        if (error) {
          throw error
        }
      }

      resetForm()
      await loadTemplates(organizationId)
    } catch (error) {
      console.error('Failed to save note template:', error)
      setFormError(getErrorMessage(error, labels.note_templates_save_error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (template: NoteTemplate) => {
    if (!organizationId) {
      return
    }

    if (!window.confirm(labels.note_templates_delete_confirm)) {
      return
    }

    const { error } = await supabase
      .from('note_templates')
      .delete()
      .eq('id', template.id)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Failed to delete note template:', error)
      setPageError(labels.note_templates_delete_error)
      return
    }

    if (editingId === template.id) {
      resetForm()
    }

    await loadTemplates(organizationId)
  }

  function eventTypeLabel(value: string | null): string | null {
    if (!value) {
      return null
    }
    return eventTypeLabelMap.get(value) ?? null
  }

  if (loading) {
    return (
      <div
        className="flex min-h-full flex-1 items-center justify-center"
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
      <div className="mx-auto w-full max-w-[720px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: colors.brand_navy,
              }}
            >
              {labels.note_templates_heading}
            </h1>
            <p
              className="mt-1"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.note_templates_subtext}
            </p>
            <p
              className="mt-1"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.note_templates_usage_subtext}
            </p>
          </div>

          {templates.length > 0 ? (
            <button
              type="button"
              onClick={openAddForm}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.note_templates_add}
            </button>
          ) : null}
        </div>

        {pageError ? (
          <p className="mb-4 text-sm text-red-500">{pageError}</p>
        ) : null}

        {formMode ? (
          <form
            onSubmit={handleSave}
            className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="note-template-name" className="mb-1 block" style={labelStyle}>
                  {labels.note_templates_name}
                </label>
                <input
                  id="note-template-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={labels.note_templates_name_placeholder}
                  className={inputClassName}
                  disabled={isSaving}
                />
                {fieldErrors.name ? (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="note-template-event-type"
                  className="mb-1 block"
                  style={labelStyle}
                >
                  {labels.note_templates_event_type}
                </label>
                <select
                  id="note-template-event-type"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className={inputClassName}
                  disabled={isSaving}
                >
                  <option value="">{labels.note_templates_all_event_types}</option>
                  {event_types.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="note-template-description"
                  className="mb-1 block"
                  style={labelStyle}
                >
                  {labels.note_templates_description}
                </label>
                <textarea
                  id="note-template-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={labels.note_templates_description_placeholder}
                  rows={3}
                  className={inputClassName}
                  disabled={isSaving}
                />
                {fieldErrors.description ? (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.description}</p>
                ) : null}
              </div>

              {formError ? (
                <p className="text-sm text-red-500">{formError}</p>
              ) : null}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: colors.brand_navy }}
                >
                  {labels.note_templates_save}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  disabled={isSaving}
                  className="text-sm hover:underline"
                  style={{ color: colors.text_muted }}
                >
                  {labels.ne_cancel}
                </button>
              </div>
            </div>
          </form>
        ) : null}

        {templates.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p
              style={{
                fontSize: '15px',
                fontWeight: 500,
                color: colors.brand_navy,
              }}
            >
              {labels.note_templates_empty_headline}
            </p>
            <p
              className="mt-2"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.note_templates_empty_subtext}
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.note_templates_add}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {templates.map((template) => {
              const typeLabel = eventTypeLabel(template.event_type)

              return (
                <li
                  key={template.id}
                  className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: colors.brand_navy,
                        }}
                      >
                        {template.name}
                      </p>
                      {typeLabel ? (
                        <span
                          className="rounded-full px-2 py-0.5"
                          style={{
                            fontSize: '10px',
                            fontWeight: 500,
                            color: colors.brand_navy,
                            border: `1px solid ${colors.brand_navy}`,
                          }}
                        >
                          {typeLabel}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className="mt-1 whitespace-pre-wrap"
                      style={{ fontSize: '13px', color: colors.text_muted }}
                    >
                      {template.description}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(template)}
                      className="rounded-lg p-2 hover:bg-gray-50"
                      style={{ color: colors.brand_navy }}
                      aria-label={`Edit ${template.name}`}
                    >
                      <IconPencil size={18} stroke={2} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(template)}
                      className="rounded-lg p-2 hover:bg-gray-50"
                      style={{ color: colors.status_red }}
                      aria-label={`Delete ${template.name}`}
                    >
                      <IconTrash size={18} stroke={2} />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
