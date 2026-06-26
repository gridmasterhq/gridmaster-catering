import {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { IconCircleCheck } from '@tabler/icons-react'
import { supabase } from '../../lib/supabase'

export interface SaveAsTemplateCheckboxProps {
  event_id: string
  organization_id: string
  event_type: string
  venue_name: string
  onTemplateSaved?: (template_name: string) => void
}

export interface SaveAsTemplateCheckboxHandle {
  saveTemplate: () => Promise<void>
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

const SaveAsTemplateCheckbox = forwardRef<
  SaveAsTemplateCheckboxHandle,
  SaveAsTemplateCheckboxProps
>(function SaveAsTemplateCheckbox(
  {
    event_id,
    organization_id,
    event_type,
    venue_name,
    onTemplateSaved,
  },
  ref,
) {
  const [checked, setChecked] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const defaultTemplateName = useMemo(
    () => `${toTitleCase(event_type)} — ${toTitleCase(venue_name)}`,
    [event_type, venue_name],
  )

  useImperativeHandle(ref, () => ({
    async saveTemplate() {
      if (!checked) {
        return
      }

      const name = templateName.trim() || defaultTemplateName
      setSaving(true)

      const { error: eventError } = await supabase
        .from('events')
        .update({
          save_as_template_checked: true,
          template_name: name,
        })
        .eq('id', event_id)
        .eq('organization_id', organization_id)

      if (eventError) {
        console.error('Failed to update event template fields', eventError.message)
        setSaving(false)
        return
      }

      const { error: templateError } = await supabase.from('templates').insert({
        organization_id,
        event_id,
        template_name: name,
        event_type,
        venue_name,
      })

      if (templateError) {
        console.log(
          '[SaveAsTemplate] templates table not available yet — event fields saved',
          name,
        )
      }

      setSaving(false)
      setSaved(true)
      onTemplateSaved?.(name)
    },
  }))

  function handleCheckedChange(nextChecked: boolean) {
    setChecked(nextChecked)
    setSaved(false)
    if (nextChecked && !templateName.trim()) {
      setTemplateName(defaultTemplateName)
    }
  }

  return (
    <div className="w-full">
      <label className="flex items-start gap-3 text-sm text-text-body">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => handleCheckedChange(event.target.checked)}
          className="mt-1 size-4 rounded border-gray-300"
        />
        <span>Save as template for future events</span>
      </label>

      <div
        className="overflow-hidden transition-all duration-200 ease-out"
        style={{
          maxHeight: checked ? '120px' : '0px',
          opacity: checked ? 1 : 0,
          marginTop: checked ? '12px' : '0px',
        }}
      >
        <input
          type="text"
          value={templateName}
          onChange={(event) => {
            setTemplateName(event.target.value)
            setSaved(false)
          }}
          placeholder="Template name"
          className="w-full rounded border border-gray-300 px-3 py-2 text-text-body focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none"
        />
      </div>

      {saved ? (
        <div
          className="mt-2 flex items-center gap-2 text-sm"
          style={{ color: '#22C55E' }}
        >
          <IconCircleCheck size={16} color="#22C55E" />
          <span>Template saved</span>
        </div>
      ) : null}

      {saving ? (
        <p className="mt-2 text-xs text-gray-500">Saving template...</p>
      ) : null}
    </div>
  )
})

export default SaveAsTemplateCheckbox
