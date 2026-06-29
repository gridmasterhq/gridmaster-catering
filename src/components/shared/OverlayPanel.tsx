import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { FormPanelContext } from './FormPanelContext'
import PanelHeaderActions from './PanelHeaderActions'

/** Right inset so panel content clears the 32px minimized-tab stack. */
export const OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX = 40

const OVERLAY_PANEL_CONTENT_MAX_WIDTH_PX = 560

export const OVERLAY_PANEL_MAX_WIDTH_PX =
  OVERLAY_PANEL_CONTENT_MAX_WIDTH_PX + OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX

interface OverlayPanelProps {
  isOpen: boolean
  title: string
  dismissable?: boolean
  visible?: boolean
  onClose: () => void
  onPanelRestore?: () => void
  children: ReactNode
  tabId?: string
  tabLabel?: string
  tabColor?: string
}

export default function OverlayPanel({
  isOpen,
  title,
  dismissable = true,
  visible = true,
  onClose,
  onPanelRestore,
  children,
  tabId,
  tabLabel,
  tabColor = '#1B3A5C',
}: OverlayPanelProps) {
  const { labels, colors } = useProductConfig()
  const [slideIn, setSlideIn] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const isFormPanel = !dismissable && tabId != null

  const { isMinimized, minimize, dismiss } = useMinimizablePanel({
    id: tabId ?? title,
    label: tabLabel ?? title,
    color: tabColor,
    enabled: isFormPanel,
    onRestore: onPanelRestore,
  })

  const formPanelContextValue = useMemo(
    () => (isFormPanel ? { minimize } : null),
    [isFormPanel, minimize],
  )

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
    dismiss()
    onClose()
  }

  const panelVisible = slideIn && !isMinimized && visible

  if (!isOpen && !isMinimized) {
    return null
  }

  return (
    <>
      {!isMinimized && visible ? (
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
          maxWidth: `${OVERLAY_PANEL_MAX_WIDTH_PX}px`,
          paddingRight: `${OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX}px`,
          boxSizing: 'border-box',
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
          <PanelHeaderActions
            onClose={handleRequestClose}
            onMinimize={isFormPanel ? minimize : undefined}
            iconColor={colors.brand_navy}
            replaceActions={
              isFormPanel && showConfirmDialog ? (
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
              ) : undefined
            }
          />
        </header>
        <FormPanelContext.Provider value={formPanelContextValue}>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </FormPanelContext.Provider>
      </div>
    </>
  )
}
