import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { IconPencil, IconTrash } from '@tabler/icons-react'
import { useProductConfig } from '../lib/hooks/useProductConfig'
import { supabase } from '../lib/supabase'

interface UniformPreset {
  id: string
  name: string
}

interface RoleLibraryEntry {
  id: string
  organization_id: string
  name: string
  default_uniform_id: string | null
  default_uniform_custom_text: string | null
  sort_order: number
  created_at: string
  updated_at: string
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

export default function RolesPage() {
  const { labels, colors } = useProductConfig()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [roles, setRoles] = useState<RoleLibraryEntry[]>([])
  const [uniformPresets, setUniformPresets] = useState<UniformPreset[]>([])
  const [loading, setLoading] = useState(true)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [defaultUniformId, setDefaultUniformId] = useState('')
  const [customUniformText, setCustomUniformText] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [pageError, setPageError] = useState<string | null>(null)

  const uniformNameMap = useMemo(
    () => new Map(uniformPresets.map((preset) => [preset.id, preset.name])),
    [uniformPresets],
  )

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.brand_navy,
  } as const

  const loadData = useCallback(
    async (orgId: string) => {
      setLoading(true)
      setPageError(null)

      const [rolesResult, uniformsResult] = await Promise.all([
        supabase
          .from('roles_library')
          .select(
            'id, organization_id, name, default_uniform_id, default_uniform_custom_text, sort_order, created_at, updated_at',
          )
          .eq('organization_id', orgId)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('uniform_presets')
          .select('id, name')
          .eq('organization_id', orgId)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
      ])

      if (rolesResult.error) {
        console.error('Failed to load roles:', rolesResult.error)
        setPageError(labels.roles_load_error)
        setRoles([])
      } else {
        setRoles(rolesResult.data ?? [])
      }

      if (uniformsResult.error) {
        console.error('Failed to load uniform presets:', uniformsResult.error)
        setUniformPresets([])
      } else {
        setUniformPresets(uniformsResult.data ?? [])
      }

      setLoading(false)
    },
    [labels.roles_load_error],
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
        setPageError(labels.roles_load_error)
        return
      }

      const trimmedOrgId = orgId.trim()
      setOrganizationId(trimmedOrgId)
      await loadData(trimmedOrgId)
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [labels.roles_load_error, loadData])

  const resetForm = () => {
    setFormMode(null)
    setEditingId(null)
    setName('')
    setDefaultUniformId('')
    setCustomUniformText('')
    setFieldErrors({})
    setFormError(null)
  }

  const openAddForm = () => {
    setFormMode('add')
    setEditingId(null)
    setName('')
    setDefaultUniformId('')
    setCustomUniformText('')
    setFieldErrors({})
    setFormError(null)
  }

  const openEditForm = (role: RoleLibraryEntry) => {
    setFormMode('edit')
    setEditingId(role.id)
    setName(role.name)
    setDefaultUniformId(role.default_uniform_id ?? '')
    setCustomUniformText(role.default_uniform_custom_text ?? '')
    setFieldErrors({})
    setFormError(null)
  }

  const getUniformDisplay = (role: RoleLibraryEntry): string => {
    if (role.default_uniform_id) {
      return uniformNameMap.get(role.default_uniform_id) ?? labels.roles_no_uniform
    }
    if (role.default_uniform_custom_text?.trim()) {
      return role.default_uniform_custom_text.trim()
    }
    return labels.roles_no_uniform
  }

  const validateForm = (): boolean => {
    const next: { name?: string } = {}

    if (!name.trim()) {
      next.name = labels.roles_field_required
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
      const payload = {
        name: trimmedName,
        default_uniform_id: defaultUniformId || null,
        default_uniform_custom_text: customUniformText.trim() || null,
        updated_at: new Date().toISOString(),
      }

      if (formMode === 'edit' && editingId) {
        const { error } = await supabase
          .from('roles_library')
          .update(payload)
          .eq('id', editingId)
          .eq('organization_id', organizationId)

        if (error) {
          throw error
        }
      } else {
        const nextSortOrder =
          roles.length > 0
            ? Math.max(...roles.map((role) => role.sort_order)) + 1
            : 0

        const { error } = await supabase.from('roles_library').insert({
          organization_id: organizationId,
          ...payload,
          sort_order: nextSortOrder,
        })

        if (error) {
          throw error
        }
      }

      resetForm()
      await loadData(organizationId)
    } catch (error) {
      console.error('Failed to save role:', error)
      setFormError(getErrorMessage(error, labels.roles_save_error))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (role: RoleLibraryEntry) => {
    if (!organizationId) {
      return
    }

    if (!window.confirm(labels.roles_delete_confirm)) {
      return
    }

    const { error } = await supabase
      .from('roles_library')
      .delete()
      .eq('id', role.id)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('Failed to delete role:', error)
      setPageError(labels.roles_delete_error)
      return
    }

    if (editingId === role.id) {
      resetForm()
    }

    await loadData(organizationId)
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
              {labels.roles_page_heading}
            </h1>
            <p
              className="mt-1"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.roles_page_subtext}
            </p>
          </div>

          {roles.length > 0 ? (
            <button
              type="button"
              onClick={openAddForm}
              className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.roles_add}
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
                <label htmlFor="role-name" className="mb-1 block" style={labelStyle}>
                  {labels.roles_name}
                </label>
                <input
                  id="role-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={labels.roles_name_placeholder}
                  className={inputClassName}
                  disabled={isSaving}
                />
                {fieldErrors.name ? (
                  <p className="mt-1 text-xs text-red-500">{fieldErrors.name}</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="role-uniform" className="mb-1 block" style={labelStyle}>
                  {labels.roles_default_uniform}
                </label>
                <select
                  id="role-uniform"
                  value={defaultUniformId}
                  onChange={(e) => setDefaultUniformId(e.target.value)}
                  className={inputClassName}
                  disabled={isSaving}
                >
                  <option value="">{labels.roles_select_uniform}</option>
                  {uniformPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="role-custom-uniform" className="mb-1 block" style={labelStyle}>
                  {labels.roles_custom_uniform}
                </label>
                <textarea
                  id="role-custom-uniform"
                  value={customUniformText}
                  onChange={(e) => setCustomUniformText(e.target.value)}
                  placeholder={labels.roles_custom_uniform_placeholder}
                  rows={3}
                  className={inputClassName}
                  disabled={isSaving}
                />
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
                  {labels.roles_save}
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

        {roles.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p
              style={{
                fontSize: '15px',
                fontWeight: 500,
                color: colors.brand_navy,
              }}
            >
              {labels.roles_empty_headline}
            </p>
            <p
              className="mt-2"
              style={{ fontSize: '13px', color: colors.text_muted }}
            >
              {labels.roles_empty_subtext}
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className="mt-6 rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.roles_add}
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {roles.map((role) => (
              <li
                key={role.id}
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
                    {role.name}
                  </p>
                  <p
                    className="mt-1"
                    style={{ fontSize: '13px', color: colors.text_muted }}
                  >
                    {getUniformDisplay(role)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(role)}
                    className="rounded-lg p-2 hover:bg-gray-50"
                    style={{ color: colors.brand_navy }}
                    aria-label={`Edit ${role.name}`}
                  >
                    <IconPencil size={18} stroke={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(role)}
                    className="rounded-lg p-2 hover:bg-gray-50"
                    style={{ color: colors.status_red }}
                    aria-label={`Delete ${role.name}`}
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
