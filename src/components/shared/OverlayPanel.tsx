import { type ReactNode, useEffect, useState } from 'react'
import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'

interface OverlayPanelProps {
  isOpen: boolean
  title: string
  dismissable?: boolean
  onClose: () => void
  children: ReactNode
}

export default function OverlayPanel({
  isOpen,
  title,
  dismissable = true,
  onClose,
  children,
}: OverlayPanelProps) {
  const { labels, colors } = useProductConfig()
  const [slideIn, setSlideIn] = useState(false)
  const [minimized, setMinimized] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSlideIn(false)
      setMinimized(false)
      setShowConfirmDialog(false)
      return
    }

    const frame = requestAnimationFrame(() => {
      setSlideIn(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return
      }

      if (minimized) {
        return
      }

      if (dismissable) {
        onClose()
      } else {
        setShowConfirmDialog(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [dismissable, isOpen, minimized, onClose])

  const handleRequestClose = () => {
    if (dismissable) {
      onClose()
      return
    }

    setShowConfirmDialog(true)
  }

  const handleDiscard = () => {
    setShowConfirmDialog(false)
    setMinimized(false)
    onClose()
  }

  const panelVisible = slideIn && !minimized

  if (!isOpen) {
    return null
  }

  return (
    <>
      {!minimized ? (
        dismissable ? (
          <button
            type="button"
            aria-label="Close overlay"
            onClick={onClose}
            className="fixed inset-0 border-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 300,
              cursor: 'default',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            className="fixed inset-0"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 300,
            }}
          />
        )
      ) : null}

      <div
        className="fixed top-0 right-0 bottom-0 flex w-full flex-col bg-white shadow-xl"
        style={{
          maxWidth: '560px',
          zIndex: 301,
          transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
          pointerEvents: minimized ? 'none' : 'auto',
        }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {title}
          </h2>
          <div className="flex items-center gap-1">
            {!dismissable ? (
              <button
                type="button"
                onClick={() => setMinimized(true)}
                aria-label="Minimize"
                className="rounded p-1 hover:bg-gray-100"
                style={{ color: colors.brand_navy }}
              >
                <IconChevronRight size={20} stroke={2} />
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleRequestClose}
              aria-label="Close"
              className="rounded p-1 hover:bg-gray-100"
              style={{ color: colors.brand_navy }}
            >
              <IconX size={20} stroke={2} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {showConfirmDialog ? (
          <div
            className="absolute inset-0 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="overlay-discard-heading"
          >
            <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg">
              <p
                id="overlay-discard-heading"
                className="text-center text-sm"
                style={{ color: colors.brand_navy }}
              >
                {labels.overlay_discard_confirm}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmDialog(false)}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: colors.brand_navy }}
                >
                  {labels.overlay_keep_editing}
                </button>
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="w-full rounded-lg py-2.5 text-sm font-semibold text-white"
                  style={{ backgroundColor: colors.brand_red }}
                >
                  {labels.overlay_discard_changes}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {minimized ? (
        <button
          type="button"
          onClick={() => setMinimized(false)}
          aria-label={`Expand ${title}`}
          className="fixed top-0 right-0 bottom-0 flex flex-col items-center justify-center gap-3 border-none"
          style={{
            width: '40px',
            backgroundColor: colors.brand_navy,
            zIndex: 301,
            cursor: 'pointer',
          }}
        >
          <IconChevronLeft size={16} color="white" stroke={2} />
          <span
            style={{
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
              color: colors.white,
              fontSize: '13px',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}
          >
            {title}
          </span>
        </button>
      ) : null}
    </>
  )
}
