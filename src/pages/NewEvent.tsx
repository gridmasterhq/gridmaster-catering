import { useState } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import BEOUpload, { type BEOExtractedData } from '../components/catering/BEOUpload'
import ManualEntryForm from '../components/catering/ManualEntryForm'
import PostSavePopup from '../components/catering/PostSavePopup'
import QuickEventForm from '../components/catering/QuickEventForm'
import NewEventModeSelect, {
  type NewEventMode,
} from '../components/catering/NewEventModeSelect'
import { useFormPanel } from '../components/shared/FormPanelContext'
import { useOverlay, type NewEventOpenMode } from '../components/shared/AppShell'
import { useProductConfig } from '../lib/hooks/useProductConfig'
import type { EventSaveResult } from '../lib/types/eventTemplate'

interface PostSaveState {
  eventId: string
  eventName: string
  templateSource?: EventSaveResult['templateSource']
  templateSavedFromForm?: boolean
}

function resolveInitialMode(
  initialMode: NewEventOpenMode | null,
  hasInitialTemplate: boolean,
): NewEventMode | null {
  if (hasInitialTemplate) {
    return 'manual'
  }
  if (
    initialMode === 'quick' ||
    initialMode === 'beo' ||
    initialMode === 'manual'
  ) {
    return initialMode
  }
  return null
}

function NewEvent() {
  const {
    closeOverlay,
    newEventPrefilledDate,
    newEventInitialMode,
    newEventInitialTemplate,
    openOverlay,
  } = useOverlay()
  const formPanel = useFormPanel()
  const { labels, colors } = useProductConfig()
  const [selectedMode, setSelectedMode] = useState<NewEventMode | null>(() =>
    resolveInitialMode(
      newEventInitialMode,
      newEventInitialTemplate != null,
    ),
  )
  const [postSave, setPostSave] = useState<PostSaveState | null>(null)
  const [beoInitialValues, setBeoInitialValues] = useState<BEOExtractedData | null>(
    null,
  )

  const prefilledDate = newEventPrefilledDate ?? undefined
  const highlightTemplate = newEventInitialMode === 'template'

  const handleCancel = () => {
    setBeoInitialValues(null)
    setSelectedMode(null)
  }

  const handleSuccess = (result: EventSaveResult) => {
    setBeoInitialValues(null)
    setPostSave({
      eventId: result.eventId,
      eventName: result.eventName,
      templateSource: result.templateSource,
      templateSavedFromForm: result.templateSavedFromForm,
    })
  }

  if (selectedMode === null) {
    return (
      <NewEventModeSelect
        onSelect={setSelectedMode}
        onCancel={closeOverlay}
        onUseTemplate={() => {
          formPanel?.minimize()
          openOverlay('my-templates')
        }}
        highlightTemplate={highlightTemplate}
      />
    )
  }

  if (selectedMode === 'beo') {
    return (
      <BEOUpload
        prefilledDate={prefilledDate}
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
          className="flex flex-col px-4 py-6"
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
            prefilledDate={prefilledDate}
            initialTemplate={newEventInitialTemplate ?? undefined}
            onCancel={handleCancel}
            onSuccess={handleSuccess}
          />
        </div>

        {postSave ? (
          <PostSavePopup
            eventId={postSave.eventId}
            eventName={postSave.eventName}
            templateSource={postSave.templateSource}
            hideTemplateSection={postSave.templateSavedFromForm}
          />
        ) : null}
      </>
    )
  }

  return null
}

export default NewEvent
