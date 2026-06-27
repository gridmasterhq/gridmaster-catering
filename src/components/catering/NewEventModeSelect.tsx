import { useState } from 'react'
import {
  IconArrowLeft,
  IconBolt,
  IconCopy,
  IconEdit,
  IconFileUpload,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'

export type NewEventMode = 'quick' | 'beo' | 'manual'

interface NewEventModeSelectProps {
  onSelect: (mode: NewEventMode) => void
  onCancel: () => void
  highlightTemplate?: boolean
}

interface ModeCardConfig {
  mode: NewEventMode
  icon: Icon
  heading: string
  subtext: string
}

export default function NewEventModeSelect({
  onSelect,
  onCancel,
  highlightTemplate = false,
}: NewEventModeSelectProps) {
  const { labels, colors, navigation } = useProductConfig()
  const [pressedMode, setPressedMode] = useState<NewEventMode | null>(null)

  const pageTitle =
    navigation.blue.find((item) => item.id === 'new_event')?.label ??
    labels.es_calendar_new_event_cta.replace(/^\+ /, '')

  const modeCards: ModeCardConfig[] = [
    {
      mode: 'quick',
      icon: IconBolt,
      heading: labels.ne_quick_event,
      subtext: labels.ne_quick_event_subtext,
    },
    {
      mode: 'beo',
      icon: IconFileUpload,
      heading: labels.ne_beo_upload,
      subtext: labels.ne_beo_upload_subtext,
    },
    {
      mode: 'manual',
      icon: IconEdit,
      heading: labels.ne_manual_entry,
      subtext: labels.ne_manual_entry_subtext,
    },
  ]

  return (
    <div
      className="flex min-h-screen flex-col px-4 py-6"
      style={{ backgroundColor: colors.brand_light_blue }}
    >
      <button
        type="button"
        onClick={onCancel}
        className="mb-6 flex items-center gap-2 self-start"
        style={{ color: colors.brand_navy }}
      >
        <IconArrowLeft size={20} stroke={2} />
        <span style={{ fontSize: '14px', fontWeight: 500 }}>{labels.ne_cancel}</span>
      </button>

      <div className="mx-auto w-full max-w-[480px] flex-1">
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color: colors.brand_navy,
          }}
        >
          {pageTitle}
        </h1>
        <p
          style={{
            fontSize: '14px',
            color: colors.text_muted,
            marginTop: '8px',
            marginBottom: '24px',
          }}
        >
          {labels.ne_mode_prompt}
        </p>

        <div className="flex flex-col gap-3">
          {modeCards.map((card) => {
            const CardIcon = card.icon
            const isPressed = pressedMode === card.mode

            return (
              <button
                key={card.mode}
                type="button"
                onClick={() => onSelect(card.mode)}
                onPointerDown={() => setPressedMode(card.mode)}
                onPointerUp={() => setPressedMode(null)}
                onPointerLeave={() => setPressedMode(null)}
                onPointerCancel={() => setPressedMode(null)}
                className="flex w-full items-center gap-4 rounded-lg border border-gray-200 p-4 text-left shadow-sm transition-transform hover:shadow-md active:scale-95"
                style={{
                  backgroundColor: colors.white,
                  transform: isPressed ? 'scale(0.95)' : undefined,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.backgroundColor = colors.surface_hover
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.backgroundColor = colors.white
                }}
              >
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.brand_light_blue }}
                >
                  <CardIcon size={20} color={colors.brand_navy} stroke={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: colors.brand_navy,
                    }}
                  >
                    {card.heading}
                  </p>
                  <p
                    style={{
                      fontSize: '12px',
                      color: colors.text_muted,
                      marginTop: '4px',
                    }}
                  >
                    {card.subtext}
                  </p>
                </div>
              </button>
            )
          })}
          <button
            type="button"
            disabled
            className="flex w-full items-center gap-4 rounded-lg border p-4 text-left shadow-sm"
            style={{
              backgroundColor: highlightTemplate
                ? colors.surface_hover
                : colors.white,
              borderColor: highlightTemplate ? colors.brand_navy : '#E5E7EB',
              opacity: 0.85,
              cursor: 'default',
            }}
          >
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.brand_light_blue }}
            >
              <IconCopy size={20} color={colors.brand_navy} stroke={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  color: colors.brand_navy,
                }}
              >
                {labels.ne_use_template}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: colors.text_muted,
                  marginTop: '4px',
                }}
              >
                Coming soon
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}
