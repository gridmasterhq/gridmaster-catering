import { type ReactNode } from 'react'
import { IconChevronRight, IconX } from '@tabler/icons-react'

/** Minimum distance from the panel right edge to clear the 32px tab stack. */
export const PANEL_HEADER_ACTIONS_RIGHT_OFFSET_PX = 40

export function getPanelHeaderActionsMarginRight(
  headerPaddingPx = 16,
): number {
  return Math.max(0, PANEL_HEADER_ACTIONS_RIGHT_OFFSET_PX - headerPaddingPx)
}

type PanelHeaderActionsVariant = 'light' | 'dark'

interface PanelHeaderActionsProps {
  onClose: () => void
  onMinimize?: () => void
  variant?: PanelHeaderActionsVariant
  headerPaddingPx?: number
  leading?: ReactNode
  replaceActions?: ReactNode
  iconColor?: string
}

export default function PanelHeaderActions({
  onClose,
  onMinimize,
  variant = 'light',
  headerPaddingPx = 16,
  leading,
  replaceActions,
  iconColor,
}: PanelHeaderActionsProps) {
  const isDark = variant === 'dark'
  const resolvedIconColor = iconColor ?? (isDark ? '#ffffff' : '#1B3A5C')
  const buttonClassName = isDark
    ? 'rounded p-1 hover:bg-white/10'
    : 'rounded p-1 hover:bg-gray-100'
  const buttonStyle = isDark
    ? { color: resolvedIconColor, border: 'none', background: 'none' }
    : { color: resolvedIconColor }

  return (
    <div
      className="flex shrink-0 items-center gap-2"
      style={{
        marginRight: `${getPanelHeaderActionsMarginRight(headerPaddingPx)}px`,
      }}
    >
      {leading}
      {replaceActions ?? (
        <div className="flex items-center gap-1">
          {onMinimize ? (
            <button
              type="button"
              onClick={onMinimize}
              aria-label="Minimize"
              className={buttonClassName}
              style={buttonStyle}
            >
              <IconChevronRight size={20} stroke={2} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={buttonClassName}
            style={buttonStyle}
          >
            <IconX size={20} stroke={2} />
          </button>
        </div>
      )}
    </div>
  )
}
