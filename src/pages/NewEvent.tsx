import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowLeft } from '@tabler/icons-react'
import QuickEventForm from '../components/catering/QuickEventForm'
import NewEventModeSelect, {
  type NewEventMode,
} from '../components/catering/NewEventModeSelect'
import { useProductConfig } from '../lib/hooks/useProductConfig'

interface PostSaveState {
  eventId: string
  eventName: string
}

function NewEvent() {
  const navigate = useNavigate()
  const { labels, colors } = useProductConfig()
  const [selectedMode, setSelectedMode] = useState<NewEventMode | null>(null)
  const [postSave, setPostSave] = useState<PostSaveState | null>(null)

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
      <>
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
            onSuccess={(eventId, eventName) => {
              setPostSave({ eventId, eventName })
            }}
          />
        </div>

        {postSave ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-save-heading"
          >
            <div
              className="w-full max-w-[400px] rounded-xl bg-white p-6 shadow-lg"
              style={{ padding: '24px' }}
            >
              <h2
                id="post-save-heading"
                className="text-center text-xl font-semibold"
                style={{ color: colors.brand_navy }}
              >
                {labels.ps_event_created_heading}
              </h2>
              <p
                className="mt-2 text-center text-base font-medium"
                style={{ color: colors.brand_navy }}
              >
                {postSave.eventName}
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/event/${postSave.eventId}`)}
                  className="w-full rounded-lg py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: colors.brand_navy }}
                >
                  {labels.ps_add_more_details}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/event/${postSave.eventId}/grid`)}
                  className="w-full rounded-lg py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: colors.brand_red }}
                >
                  {labels.ps_build_staff_grid}
                </button>
              </div>

              <button
                type="button"
                onClick={() => navigate('/')}
                className="mt-4 w-full text-center text-sm text-gray-500 hover:underline"
              >
                {labels.ps_done_go_to_calendar}
              </button>
            </div>
          </div>
        ) : null}
      </>
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
