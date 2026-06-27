import { useMemo } from 'react'
import {
  IconCheck,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import {
  type EventTemplate,
  isSavedFromGridmaster,
} from '../../lib/types/eventTemplate'

interface EventTemplateCardProps {
  template: EventTemplate
  variant: 'my_templates' | 'gridmaster'
  showGridMasterBadge?: boolean
  saveFormOpen?: boolean
  saveFormName?: string
  saveFormDescription?: string
  saveFormSaving?: boolean
  saveSuccess?: boolean
  onSaveFormNameChange?: (value: string) => void
  onSaveFormDescriptionChange?: (value: string) => void
  onSaveFormSubmit?: () => void
  onSaveFormCancel?: () => void
  onCardClick?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onUseTemplate?: () => void
  onSaveToMyTemplates?: () => void
}

function resolveServiceStyleLabel(
  value: string | null,
  serviceStyles: { value: string; label: string }[],
): string | null {
  if (!value) {
    return null
  }
  const match = serviceStyles.find(
    (style) =>
      style.value === value ||
      style.label.toLowerCase() === value.toLowerCase(),
  )
  return match?.label ?? value
}

export default function EventTemplateCard({
  template,
  variant,
  showGridMasterBadge = false,
  saveFormOpen = false,
  saveFormName = '',
  saveFormDescription = '',
  saveFormSaving = false,
  saveSuccess = false,
  onSaveFormNameChange,
  onSaveFormDescriptionChange,
  onSaveFormSubmit,
  onSaveFormCancel,
  onCardClick,
  onEdit,
  onDelete,
  onUseTemplate,
  onSaveToMyTemplates,
}: EventTemplateCardProps) {
  const { colors, event_types, service_styles } = useProductConfig()

  const eventTypeConfig = useMemo(
    () => event_types.find((type) => type.value === template.event_type),
    [event_types, template.event_type],
  )

  const eventTypeColor = eventTypeConfig?.color ?? colors.brand_navy
  const serviceStyleLabel = resolveServiceStyleLabel(
    template.service_style,
    service_styles,
  )

  const tagPillStyle = {
    fontSize: '11px',
    color: colors.text_muted,
    backgroundColor: '#F3F4F6',
    borderRadius: '9999px',
    padding: '2px 8px',
  } as const

  const handleCardClick = () => {
    if (variant === 'my_templates' && onCardClick) {
      onCardClick()
    }
  }

  return (
    <div className="flex flex-col gap-0">
      <div
        role={variant === 'my_templates' ? 'button' : undefined}
        tabIndex={variant === 'my_templates' ? 0 : undefined}
        onClick={handleCardClick}
        onKeyDown={(event) => {
          if (
            variant === 'my_templates' &&
            onCardClick &&
            (event.key === 'Enter' || event.key === ' ')
          ) {
            event.preventDefault()
            onCardClick()
          }
        }}
        className="relative flex overflow-hidden"
        style={{
          backgroundColor: colors.white,
          border: '1px solid #E5E7EB',
          borderRadius: '8px',
          padding: '14px 16px',
          cursor: variant === 'my_templates' ? 'pointer' : 'default',
        }}
      >
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0"
          style={{
            width: '4px',
            backgroundColor: eventTypeColor,
            borderTopLeftRadius: '8px',
            borderBottomLeftRadius: '8px',
          }}
        />

        {showGridMasterBadge && isSavedFromGridmaster(template) ? (
          <span
            className="absolute top-3 right-3"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: colors.white,
              backgroundColor: '#008080',
              borderRadius: '9999px',
              padding: '2px 8px',
            }}
          >
            GridMaster
          </span>
        ) : null}

        <div className="min-w-0 flex-1 pl-3">
          <p
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#1B3A5C',
              paddingRight: showGridMasterBadge ? '72px' : undefined,
            }}
          >
            {template.name}
          </p>

          {template.description ? (
            <p
              style={{
                fontSize: '12px',
                color: '#6B7280',
                marginTop: '2px',
              }}
            >
              {template.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {eventTypeConfig ? (
              <span style={tagPillStyle}>{eventTypeConfig.label}</span>
            ) : null}
            {serviceStyleLabel ? (
              <span style={tagPillStyle}>{serviceStyleLabel}</span>
            ) : null}
            {template.guest_count_default != null ? (
              <span style={tagPillStyle}>
                Up to {template.guest_count_default} guests
              </span>
            ) : null}
            {template.total_staff_needed != null ? (
              <span style={tagPillStyle}>
                {template.total_staff_needed} staff
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            {variant === 'my_templates' ? (
              <>
                <span style={{ fontSize: '12px', color: colors.text_muted }}>
                  {template.updated_at === template.created_at
                    ? 'Never used'
                    : `Last used: ${new Date(template.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onEdit?.()
                    }}
                    className="rounded p-1.5 hover:bg-gray-50"
                    style={{ color: colors.brand_navy }}
                    aria-label={`Edit ${template.name}`}
                  >
                    <IconPencil size={16} stroke={2} />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDelete?.()
                    }}
                    className="rounded p-1.5 hover:bg-gray-50"
                    style={{ color: colors.status_red }}
                    aria-label={`Delete ${template.name}`}
                  >
                    <IconTrash size={16} stroke={2} />
                  </button>
                </div>
              </>
            ) : (
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {saveSuccess ? (
                  <span
                    className="flex items-center gap-1"
                    style={{ fontSize: '12px', color: colors.status_green }}
                  >
                    <IconCheck size={16} stroke={2} />
                    Saved to My Templates
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={onSaveToMyTemplates}
                      className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                      style={{
                        color: colors.brand_navy,
                        borderColor: colors.brand_navy,
                        backgroundColor: colors.white,
                      }}
                    >
                      Save to My Templates
                    </button>
                    <button
                      type="button"
                      onClick={onUseTemplate}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: colors.brand_navy }}
                    >
                      Use This Template
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {saveFormOpen ? (
        <div
          className="mt-2 rounded-lg border border-gray-200 bg-white p-4"
          style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
        >
          <div className="flex flex-col gap-3">
            <div>
              <label
                htmlFor={`save-template-name-${template.id}`}
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
                id={`save-template-name-${template.id}`}
                type="text"
                value={saveFormName}
                onChange={(event) => onSaveFormNameChange?.(event.target.value)}
                disabled={saveFormSaving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor={`save-template-description-${template.id}`}
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
                id={`save-template-description-${template.id}`}
                value={saveFormDescription}
                onChange={(event) =>
                  onSaveFormDescriptionChange?.(event.target.value)
                }
                disabled={saveFormSaving}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSaveFormSubmit}
                disabled={saveFormSaving || !saveFormName.trim()}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: colors.brand_navy }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={onSaveFormCancel}
                disabled={saveFormSaving}
                className="text-sm hover:underline"
                style={{ color: colors.text_muted }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
