import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowLeft } from '@tabler/icons-react'
import QuickEventForm from '../components/catering/QuickEventForm'
import NewEventModeSelect, {
  type NewEventMode,
} from '../components/catering/NewEventModeSelect'
import { useProductConfig } from '../lib/hooks/useProductConfig'

function NewEvent() {
  const navigate = useNavigate()
  const { labels, colors } = useProductConfig()
  const [selectedMode, setSelectedMode] = useState<NewEventMode | null>(null)

  const modeLabel = useMemo(() => {
    if (selectedMode === 'quick') {
      return labels.ne_quick_event
    }
    if (selectedMode === 'beo') {
      return labels.ne_beo_upload
    }
    if (selectedMode === 'manual') {
      return labels.ne_manual_entry
    }
    return ''
  }, [labels, selectedMode])

  if (selectedMode === null) {
    return (
      <NewEventModeSelect
        onSelect={setSelectedMode}
        onCancel={() => navigate('/')}
      />
    )
  }

  if (selectedMode === 'quick') {
    return (
      <div
        className="flex min-h-screen flex-col px-4 py-6"
        style={{ backgroundColor: colors.brand_light_blue }}
      >
        <button
          type="button"
          onClick={() => setSelectedMode(null)}
          className="mb-6 flex items-center gap-2 self-start"
          style={{ color: colors.brand_navy }}
        >
          <IconArrowLeft size={20} stroke={2} />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>
            {labels.ne_cancel}
          </span>
        </button>

        <QuickEventForm
          onCancel={() => setSelectedMode(null)}
          onSuccess={() => {
            navigate('/')
          }}
        />
      </div>
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col px-4 py-6"
      style={{ backgroundColor: colors.brand_light_blue }}
    >
      <button
        type="button"
        onClick={() => setSelectedMode(null)}
        className="mb-6 flex items-center gap-2 self-start"
        style={{ color: colors.brand_navy }}
      >
        <IconArrowLeft size={20} stroke={2} />
        <span style={{ fontSize: '14px', fontWeight: 500 }}>{labels.ne_cancel}</span>
      </button>

      <div
        className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center rounded-lg border border-gray-200 p-8 text-center shadow-sm"
        style={{ backgroundColor: colors.white }}
      >
        <p style={{ fontSize: '16px', color: colors.text_body }}>
          {modeLabel} {labels.ne_mode_selected} — {labels.coming_soon}
        </p>
      </div>
    </div>
  )
}

export default NewEvent
