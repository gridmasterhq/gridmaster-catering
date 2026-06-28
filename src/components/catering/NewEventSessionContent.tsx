import { useState } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import BEOUpload, { type BEOExtractedData } from './BEOUpload'
import ManualEntryForm from './ManualEntryForm'
import PostSavePopup from './PostSavePopup'
import QuickEventForm from './QuickEventForm'
import type { NewEventMode } from './NewEventModeSelect'
import { useFormPanel } from '../shared/FormPanelContext'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import type { EventTemplate } from '../../lib/types/eventTemplate'
import type { EventSaveResult } from '../../lib/types/eventTemplate'

interface PostSaveState {
  eventId: string
  eventName: string
  templateSource?: EventSaveResult['templateSource']
  templateSavedFromForm?: boolean
}

interface NewEventSessionContentProps {
  mode: NewEventMode
  prefilledDate?: Date
  initialTemplate?: EventTemplate
  onCloseSession: () => void
  onUseTemplate: () => void
  highlightTemplate?: boolean
}

export default function NewEventSessionContent({
  mode,
  prefilledDate,
  initialTemplate,
  onCloseSession: _onCloseSession,
  onUseTemplate: _onUseTemplate,
  highlightTemplate: _highlightTemplate = false,
}: NewEventSessionContentProps) {
  void _onCloseSession
  void _onUseTemplate
  void _highlightTemplate

  const { labels, colors } = useProductConfig()
  const [selectedMode, setSelectedMode] = useState<NewEventMode>(mode)
  const [postSave, setPostSave] = useState<PostSaveState | null>(null)
  const [beoInitialValues, setBeoInitialValues] = useState<BEOExtractedData | null>(
    null,
  )

  const handleCancel = () => {
    setBeoInitialValues(null)
    setSelectedMode(mode)
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
            initialTemplate={initialTemplate}
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
