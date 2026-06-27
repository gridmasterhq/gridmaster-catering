import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

interface UniformPreset {
  id: string
  organization_id: string
  name: string
  description: string
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

export default function UniformsPage() {
  const navigate = useNavigate()
  const { labels, colors } = useProductConfig()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [presets, setPresets] = useState<UniformPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [presetName, setPresetName] = useState('')
  const [presetDescription, setPresetDescription] = useState('')
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

  const loadPresets = useCallback(async (orgId: string) => {
    setLoading(true)
    setPageError(null)

    const { data, error } = await supabase
      .from('uniform_presets')
      .select('id, organization_id, name, description, sort_order')
      .eq('organization_id', orgId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      console.error('Failed to load uniform presets:', error)
      setPageError(labels.uniforms_load_error)
      setPresets([])
    } else {
      setPresets(data ?? [])
    }

    setLoading(false)
  }, [labels.uniforms_load_error])

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
        setPageError(labels.uniforms_load_error)
        return
      }

      const trimmedOrgId = orgId.trim()
      setOrganizationId(trimmedOrgId)
      await loadPresets(trimmedOrgId)
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [labels.uniforms_load_error, loadPresets])

  const resetForm = () => {
    setFormMode(null)
    setEditingId(null)
    setPresetName('')
    setPresetDescription('')
    setFieldErrors({})
    setFormError(null)
  }

  const openAddForm = () => {
    setFormMode('add')
    setEditingId(null)
    setPresetName('')
    setPresetDescription('')
    setFieldErrors({})
    setFormError(null)
  }

  const openEditForm = (preset: UniformPreset) => {
    setFormMode('edit')
    setEditingId(preset.id)
    setPresetName(preset.name)
    setPresetDescription(preset.description)
    setFieldErrors({})
    setFormError(null)
  }

  const validateForm = (): boolean => {
    const next: { name?: string; description?: string } = {}
    const required = labels.uniforms_field_required

    if (!presetName.trim()) {
      next.name = required
    }
    if (!presetDescription.trim()) {
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
      const trimmedName = presetName.trim()
      const trimmedDescription = presetDescription.trim()

      if (formMode === 'edit' && editingId) {
        const { error } = await supabase
          .from('uniform_presets')
          .update({
            name: trimmedName,
            description: trimmedDescription,
          })
          .eq('id', editingId)
          .eq('organization_id', organizationId)

        if (error) {
          throw error
        }
      } else {
        const nextSortOrder =
          presets.length > 0
            ? Math.max(...presets.map((preset) => preset.sort_order)) + 1
            : 0

        const { error } = await supabase.from('uniform_presets').insert({
          organization_id: organizationId,
          name: trimmedName,
          description: trimmedDescription,
          sort_order: nextSortOrder,
        })

        if (error) {
          throw error
        }
      }

      resetForm()
      await loadPresets(organizationId)
    } catch (error) {
      console.error('Failed to save uniform preset:', error)
      setFormError(getErrorMessage(error, labels.uniforms_save_error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (preset: UniformPreset) => {
    if (!organizationId) {
      return
    }

    if (!window.confirm(labels.uniforms_delete_confirm)) {
      return
    }

    const { error } = await supabase
      .from('uniform_presets')
      .delete()
      .eq('id', preset.id)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Failed to delete uniform preset:', error)
      setPageError(labels.uniforms_delete_error)
      return
    }

    if (editingId === preset.id) {
      resetForm()
    }

    await loadPresets(organizationId)
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
              {labels.uniforms_heading}
            </h1>
            <p
              className="mt-1"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.uniforms_subtext}
            </p>
            <p
              className="mt-1"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.uniforms_roles_subtext_prefix}
              <button
                type="button"
                onClick={() => navigate('/roles')}
                className="inline p-0 underline"
                style={{
                  fontSize: '13px',
                  color: colors.brand_navy,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {labels.roles_page_heading}
              </button>
              {labels.uniforms_roles_subtext_suffix}
            </p>
          </div>

          {presets.length > 0 ? (
            <button
              type="button"
              onClick={openAddForm}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.uniforms_add}
            </button>
          ) : null}
        </div>

        {pageError ? (
          <p className="mb-4 text-sm text-red-500">{pageError}</p>
        ) : null}

        {formMode ? (
          <form
            key={formMode === 'edit' ? `edit-${editingId}` : 'add'}
            onSubmit={handleSave}
            className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-col gap-4">
              <div>
                <label htmlFor="uniform-name" className="mb-1 block" style={labelStyle}>
                  {labels.uniforms_name}
                </label>
                <input
                  id="uniform-name"
                  name="uniform-preset-name"
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder={labels.uniforms_name_placeholder}
                  className={inputClassName}
                  disabled={isSaving}
                  autoComplete="off"
                />
                {fieldErrors.name ? (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="uniform-description"
                  className="mb-1 block"
                  style={labelStyle}
                >
                  {labels.uniforms_description}
                </label>
                <textarea
                  id="uniform-description"
                  name="uniform-preset-description"
                  value={presetDescription}
                  onChange={(e) => setPresetDescription(e.target.value)}
                  placeholder={labels.uniforms_description_placeholder}
                  rows={3}
                  className={inputClassName}
                  disabled={isSaving}
                  autoComplete="off"
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
                  {labels.uniforms_save}
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

        {presets.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p
              style={{
                fontSize: '15px',
                fontWeight: 500,
                color: colors.brand_navy,
              }}
            >
              {labels.uniforms_empty_headline}
            </p>
            <p
              className="mt-2"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.uniforms_empty_subtext}
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.uniforms_add}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {presets.map((preset) => (
              <li
                key={preset.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: colors.brand_navy,
                    }}
                  >
                    {preset.name}
                  </p>
                  <p
                    className="mt-1 whitespace-pre-wrap"
                    style={{ fontSize: '13px', color: colors.text_muted }}
                  >
                    {preset.description}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(preset)}
                    className="rounded-lg p-2 hover:bg-gray-50"
                    style={{ color: colors.brand_navy }}
                    aria-label={`Edit ${preset.name}`}
                  >
                    <IconPencil size={18} stroke={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(preset)}
                    className="rounded-lg p-2 hover:bg-gray-50"
                    style={{ color: colors.status_red }}
                    aria-label={`Delete ${preset.name}`}
                  >
                    <IconTrash size={18} stroke={2} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
