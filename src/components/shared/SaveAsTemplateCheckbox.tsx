import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { IconCopy } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { buildDefaultTemplateDescription, insertMyEventTemplate } from '../../lib/eventTemplateSave'
import type { EventTemplateSourceData } from '../../lib/types/eventTemplate'

export interface SaveAsTemplateCheckboxProps {
  sourceData: EventTemplateSourceData
  checkboxLabel: string
  showDivider?: boolean
}

export interface SaveAsTemplateCheckboxHandle {
  isChecked: () => boolean
  validateForSubmit: () => boolean
  saveTemplate: () => Promise<{ success: boolean }>
}

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none'

const SaveAsTemplateCheckbox = forwardRef<
  SaveAsTemplateCheckboxHandle,
  SaveAsTemplateCheckboxProps
>(function SaveAsTemplateCheckbox(
  { sourceData, checkboxLabel, showDivider = false },
  ref,
) {
  const { labels, colors, event_types, service_styles } = useProductConfig()
  const [checked, setChecked] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [description, setDescription] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const eventTypeLabel = useMemo(() => {
    if (!sourceData.event_type) {
      return null
    }
    return (
      event_types.find((type) => type.value === sourceData.event_type)?.label ??
      null
    )
  }, [event_types, sourceData.event_type])

  const serviceStyleLabel = useMemo(() => {
    if (!sourceData.service_style) {
      return null
    }
    return (
      service_styles.find((style) => style.value === sourceData.service_style)
        ?.label ?? null
    )
  }, [service_styles, sourceData.service_style])

  const defaultTemplateName = sourceData.event_name
  const defaultDescription = useMemo(
    () => buildDefaultTemplateDescription(eventTypeLabel, serviceStyleLabel),
    [eventTypeLabel, serviceStyleLabel],
  )

  useImperativeHandle(ref, () => ({
    isChecked: () => checked,
    validateForSubmit: () => {
      if (!checked) {
        setNameError(null)
        return true
      }

      if (!templateName.trim()) {
        setNameError(labels.save_as_template_name_required)
        return false
      }

      setNameError(null)
      return true
    },
    async saveTemplate() {
      if (!checked) {
        return { success: true }
      }

      const trimmedName = templateName.trim()
      if (!trimmedName) {
        setNameError(labels.save_as_template_name_required)
        return { success: false }
      }

      setSaving(true)
      setSaveError(null)

      const { error } = await insertMyEventTemplate(
        sourceData,
        trimmedName,
        description.trim() || null,
      )

      setSaving(false)

      if (error) {
        console.error('Failed to save event template:', error)
        setSaveError(labels.save_as_template_save_error)
        return { success: false }
      }

      return { success: true }
    },
  }))

  function resetToDefaults() {
    setTemplateName(defaultTemplateName)
    setDescription(defaultDescription)
    setNameError(null)
    setSaveError(null)
  }

  function handleCheckedChange(nextChecked: boolean) {
    setChecked(nextChecked)
    if (nextChecked) {
      resetToDefaults()
      return
    }

    setTemplateName('')
    setDescription('')
    setNameError(null)
    setSaveError(null)
  }

  return (
    <div className="w-full">
      {showDivider ? (
        <hr className="mb-4 border-gray-200" style={{ borderColor: '#E5E7EB' }} />
      ) : null}

      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => handleCheckedChange(event.target.checked)}
          className="mt-0.5 size-4 rounded border-gray-300"
        />
        <span className="flex items-center gap-1.5">
          <IconCopy size={14} color={colors.brand_navy} stroke={2} />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#1B3A5C',
            }}
          >
            {checkboxLabel}
          </span>
        </span>
      </label>

      {checked ? (
        <div className="mt-3 flex flex-col gap-3 pl-6">
          <div>
            <label
              htmlFor="save-as-template-name"
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
              id="save-as-template-name"
              type="text"
              value={templateName}
              onChange={(event) => {
                setTemplateName(event.target.value)
                setNameError(null)
                setSaveError(null)
              }}
              disabled={saving}
              className={inputClassName}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-red-500">{nameError}</p>
            ) : null}
            {saveError ? (
              <p className="mt-1 text-xs text-red-500">{saveError}</p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="save-as-template-description"
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
              id="save-as-template-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
              rows={2}
              className={inputClassName}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
})

export default SaveAsTemplateCheckbox
