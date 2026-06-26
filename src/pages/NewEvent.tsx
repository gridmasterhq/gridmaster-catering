import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconArrowLeft } from '@tabler/icons-react'
import BEOUpload, { type BEOExtractedData } from '../components/catering/BEOUpload'
import ManualEntryForm from '../components/catering/ManualEntryForm'
import PostSavePopup from '../components/catering/PostSavePopup'
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
  const [beoInitialValues, setBeoInitialValues] = useState<BEOExtractedData | null>(
    null,
  )

  const handleCancel = () => {
    setBeoInitialValues(null)
    setSelectedMode(null)
  }

  const handleSuccess = (eventId: string, eventName: string) => {
    setBeoInitialValues(null)
    setPostSave({ eventId, eventName })
  }

  if (selectedMode === null) {
    return (
      <NewEventModeSelect
        onSelect={setSelectedMode}
        onCancel={() => navigate('/')}
      />
    )
  }

  if (selectedMode === 'beo') {
    return (
      <BEOUpload
        onCancel={handleCancel}
        onSuccess={(extractedData) => {
          setBeoInitialValues(extractedData)
          setSelectedMode('manual')
        }}
      />
    )
  }

  if (selectedMode === 'quick' || selectedMode === 'manual') {
    const FormComponent =
      selectedMode === 'quick' ? QuickEventForm : ManualEntryForm

    return (
      <>
        <div
          className="flex min-h-screen flex-col px-4 py-6"
          style={{ backgroundColor: colors.brand_light_blue }}
        >
          <button
            type="button"
            onClick={handleCancel}
            className="mb-6 flex items-center gap-2 self-start"
            style={{ color: colors.brand_navy }}
          >
            <IconArrowLeft size={20} stroke={2} />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>
              {labels.ne_cancel}
            </span>
          </button>

          <FormComponent
            initialValues={beoInitialValues ?? undefined}
            onCancel={handleCancel}
            onSuccess={handleSuccess}
          />
        </div>

        {postSave ? (
          <PostSavePopup eventId={postSave.eventId} eventName={postSave.eventName} />
        ) : null}
      </>
    )
  }

  return null
}

export default NewEvent
