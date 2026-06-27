import { type ReactNode, useEffect, useState } from 'react'
import { IconX } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'

interface OverlayPanelProps {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
}

export default function OverlayPanel({
  isOpen,
  title,
  onClose,
  children,
}: OverlayPanelProps) {
  const { colors } = useProductConfig()
  const [slideIn, setSlideIn] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSlideIn(false)
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
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <>
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
      <div
        className="fixed top-0 right-0 bottom-0 flex w-full flex-col bg-white shadow-xl"
        style={{
          maxWidth: '560px',
          zIndex: 301,
          transform: slideIn ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3"
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 hover:bg-gray-100"
            style={{ color: colors.brand_navy }}
          >
            <IconX size={20} stroke={2} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </>
  )
}
