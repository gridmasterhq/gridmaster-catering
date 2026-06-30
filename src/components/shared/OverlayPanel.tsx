import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { APP_SHELL_HEADER_HEIGHT_PX } from '../../constants/layout'
import { Z_INDEX } from '../../constants/zIndex'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { FormPanelContext } from './FormPanelContext'
import PanelHeaderActions from './PanelHeaderActions'

/**
 * SHARED COMPONENT — GridMaster HQ Global Right-Side Panel
 *
 * This is the standard panel component for ALL right-side overlay panels
 * across every GridMaster HQ product: Catering, Venues, Gigs, Stay, HQ Centers.
 *
 * Every new panel in any GridMaster HQ product must use this component.
 * Never build a custom panel header — always use OverlayPanel + PanelHeaderActions.
 *
 * Panel behavior (locked):
 *
 * - Slides in from the right
 *
 * - dismissable=true: backdrop click closes, ESC closes, chevron minimizes to tab stack
 *
 * - dismissable=false (forms): backdrop click minimizes, ESC shows confirm dialog
 *
 * - Tab stack clearance: 40px right offset so tabs are never obscured
 *
 * - Minimize: panel slides off screen, tab appears in right-side tab stack
 *
 * - Restore: tab click brings panel back with all state intact
 *
 * - Close (X): fully unmounts panel and clears state
 */

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
  headerLeading?: ReactNode
  contentMaxWidthPx?: number
  confirmCloseOpen?: boolean
  onConfirmCloseChange?: (open: boolean) => void
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
  headerLeading,
  contentMaxWidthPx,
  confirmCloseOpen,
  onConfirmCloseChange,
}: OverlayPanelProps) {
  const { labels, colors } = useProductConfig()
  const [slideIn, setSlideIn] = useState(false)
  const [internalConfirmCloseOpen, setInternalConfirmCloseOpen] = useState(false)
  const isConfirmCloseControlled = confirmCloseOpen !== undefined
  const showConfirmDialog = isConfirmCloseControlled
    ? confirmCloseOpen
    : internalConfirmCloseOpen
  const setShowConfirmDialog = useCallback(
    (open: boolean) => {
      if (isConfirmCloseControlled) {
        onConfirmCloseChange?.(open)
        return
      }
      setInternalConfirmCloseOpen(open)
    },
    [isConfirmCloseControlled, onConfirmCloseChange],
  )
  const isFormPanel = tabId != null
  const panelMaxWidthPx =
    (contentMaxWidthPx ?? OVERLAY_PANEL_CONTENT_MAX_WIDTH_PX) +
    OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX

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

    if (!visible) {
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
  }, [dismissable, isOpen, isMinimized, onClose, visible])

  const handleRequestClose = () => {
    if (dismissable) {
      if (tabId != null) {
        dismiss()
      }
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
            onClick={handleRequestClose}
            className="fixed inset-0 border-none"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              zIndex: Z_INDEX.OVERLAY_PANEL,
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
              zIndex: Z_INDEX.OVERLAY_PANEL,
              cursor: 'default',
            }}
          />
        )
      ) : null}

      <div
        className="fixed right-0 flex w-full flex-col bg-white shadow-xl"
        style={{
          top: APP_SHELL_HEADER_HEIGHT_PX,
          height: `calc(100vh - ${APP_SHELL_HEADER_HEIGHT_PX}px)`,
          maxWidth: `${panelMaxWidthPx}px`,
          paddingRight: `${OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX}px`,
          boxSizing: 'border-box',
          zIndex: Z_INDEX.OVERLAY_PANEL,
          transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
          pointerEvents: isMinimized ? 'none' : 'auto',
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between px-4 py-3"
          style={{
            backgroundColor: colors.brand_navy,
            borderBottom: '1px solid rgba(255,255,255,0.15)',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            {title}
          </h2>
          <PanelHeaderActions
            variant="dark"
            onClose={handleRequestClose}
            onMinimize={isFormPanel ? minimize : undefined}
            iconColor="#ffffff"
            leading={headerLeading}
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
