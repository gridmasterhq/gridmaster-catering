import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOverlay } from '../../components/shared/AppShell'
import SaveAsTemplateCheckbox, {
  type SaveAsTemplateCheckboxHandle,
} from '../../components/shared/SaveAsTemplateCheckbox'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import type { EventTemplateSourceData } from '../../lib/types/eventTemplate'

interface PostSavePopupProps {
  eventId: string
  eventName: string
  templateSource?: EventTemplateSourceData
  hideTemplateSection?: boolean
}

export default function PostSavePopup({
  eventId,
  eventName,
  templateSource,
  hideTemplateSection = false,
}: PostSavePopupProps) {
  const navigate = useNavigate()
  const { closeOverlay } = useOverlay()
  const { labels, colors } = useProductConfig()
  const templateRef = useRef<SaveAsTemplateCheckboxHandle>(null)

  const handleAction = async (action: () => void) => {
    if (!hideTemplateSection && templateSource) {
      if (!templateRef.current?.validateForSubmit()) {
        return
      }

      if (templateRef.current.isChecked()) {
        await templateRef.current.saveTemplate()
      }
    }

    action()
  }

  return (
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
          {eventName}
        </p>

        {!hideTemplateSection && templateSource ? (
          <div className="mt-6">
            <SaveAsTemplateCheckbox
              ref={templateRef}
              sourceData={templateSource}
              checkboxLabel={labels.save_as_template_post_save_label}
              showDivider
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            onClick={() => void handleAction(() => navigate(`/event/${eventId}`))}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: colors.brand_navy }}
          >
            {labels.ps_add_more_details}
          </button>
          <button
            type="button"
            onClick={() =>
              void handleAction(() => navigate(`/event/${eventId}/grid`))
            }
            className="w-full rounded-lg py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: colors.brand_red }}
          >
            {labels.ps_build_staff_grid}
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            void handleAction(() => {
              closeOverlay()
              navigate('/')
            })
          }
          className="mt-4 w-full text-center text-sm text-gray-500 hover:underline"
        >
          {labels.ps_done_go_to_calendar}
        </button>
      </div>
    </div>
  )
}
