import { type ReactNode, useEffect, useState } from 'react'
import { IconChevronRight, IconX } from '@tabler/icons-react'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'

interface OverlayPanelProps {
  isOpen: boolean
  title: string
  dismissable?: boolean
  onClose: () => void
  children: ReactNode
  tabId?: string
  tabLabel?: string
  tabColor?: string
}

export default function OverlayPanel({
  isOpen,
  title,
  dismissable = true,
  onClose,
  children,
  tabId,
  tabLabel,
  tabColor = '#1B3A5C',
}: OverlayPanelProps) {
  const { labels, colors } = useProductConfig()
  const [slideIn, setSlideIn] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const isFormPanel = !dismissable && tabId != null

  const { isMinimized, minimize, restore } = useMinimizablePanel({
    id: tabId ?? title,
    label: tabLabel ?? title,
    color: tabColor,
    enabled: isFormPanel,
  })

  useEffect(() => {
    if (!isOpen) {
      setSlideIn(false)
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

      if (isMinimized) {
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
  }, [dismissable, isOpen, isMinimized, onClose])

  const handleRequestClose = () => {
    if (dismissable) {
      onClose()
      return
    }

    setShowConfirmDialog(true)
  }

  const handleDiscard = () => {
    setShowConfirmDialog(false)
    if (isMinimized) {
      restore()
    }
    onClose()
  }

  const panelVisible = slideIn && !isMinimized

  if (!isOpen) {
    return null
  }

  return (
    <>
      {!isMinimized ? (
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
          <button
            type="button"
            aria-label="Minimize overlay"
            onClick={minimize}
            className="fixed inset-0 border-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: 300,
              cursor: 'default',
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
          pointerEvents: isMinimized ? 'none' : 'auto',
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
            {isFormPanel ? (
              showConfirmDialog ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="border-none bg-transparent p-0"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: colors.brand_red,
                      cursor: 'pointer',
                    }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmDialog(false)}
                    className="border-none bg-transparent p-0"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#6B7280',
                      cursor: 'pointer',
                    }}
                  >
                    {labels.overlay_keep_editing}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={minimize}
                    aria-label="Minimize"
                    className="rounded p-1 hover:bg-gray-100"
                    style={{ color: colors.brand_navy }}
                  >
                    <IconChevronRight size={20} stroke={2} />
                  </button>
                  <button
                    type="button"
                    onClick={handleRequestClose}
                    aria-label="Close"
                    className="rounded p-1 hover:bg-gray-100"
                    style={{ color: colors.brand_navy }}
                  >
                    <IconX size={20} stroke={2} />
                  </button>
                </>
              )
            ) : (
              <button
                type="button"
                onClick={handleRequestClose}
                aria-label="Close"
                className="rounded p-1 hover:bg-gray-100"
                style={{ color: colors.brand_navy }}
              >
                <IconX size={20} stroke={2} />
              </button>
            )}
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  )
}
