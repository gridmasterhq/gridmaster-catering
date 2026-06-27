import { useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  IconBolt,
  IconCopy,
  IconEdit,
  IconFileUpload,
} from '@tabler/icons-react'
import { useProductConfig } from '../lib/hooks/useProductConfig'

export interface DayContextMenuProps {
  date: Date
  anchorEl: HTMLElement | null
  onClose: () => void
  onQuickEvent: (date: Date) => void
  onBEOUpload: (date: Date) => void
  onManualEntry: (date: Date) => void
  onUseTemplate: (date: Date) => void
}

const BRAND_NAVY = '#1B3A5C'
const MENU_WIDTH = 200

export default function DayContextMenu({
  date,
  anchorEl,
  onClose,
  onQuickEvent,
  onBEOUpload,
  onManualEntry,
  onUseTemplate,
}: DayContextMenuProps) {
  const { labels } = useProductConfig()
  const menuRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!anchorEl || !menuRef.current) {
      return
    }

    const rect = anchorEl.getBoundingClientRect()
    const menuEl = menuRef.current

    let top = rect.bottom + 4
    let left = rect.left

    if (left + MENU_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - MENU_WIDTH - 8
    }

    const menuHeight = menuEl.offsetHeight || 180
    if (top + menuHeight > window.innerHeight - 8) {
      top = rect.top - menuHeight - 4
    }

    menuEl.style.top = `${top}px`
    menuEl.style.left = `${left}px`
  }, [anchorEl])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (menuRef.current?.contains(event.target as Node)) {
        return
      }
      onClose()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const itemStyle = {
    height: '40px',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    color: BRAND_NAVY,
    backgroundColor: 'white',
    cursor: 'pointer',
    width: '100%',
    border: 'none',
    textAlign: 'left' as const,
  }

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        width: `${MENU_WIDTH}px`,
        zIndex: 1000,
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        boxShadow:
          '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F8F9FA'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white'
        }}
        onClick={() => onQuickEvent(date)}
      >
        <IconBolt size={18} stroke={2} color={BRAND_NAVY} />
        {labels.ne_quick_event}
      </button>
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F8F9FA'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white'
        }}
        onClick={() => onBEOUpload(date)}
      >
        <IconFileUpload size={18} stroke={2} color={BRAND_NAVY} />
        {labels.ne_beo_upload}
      </button>
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F8F9FA'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white'
        }}
        onClick={() => onManualEntry(date)}
      >
        <IconEdit size={18} stroke={2} color={BRAND_NAVY} />
        {labels.ne_manual_entry}
      </button>
      <div style={{ height: '1px', backgroundColor: '#E5E7EB' }} />
      <button
        type="button"
        role="menuitem"
        style={itemStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#F8F9FA'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'white'
        }}
        onClick={() => onUseTemplate(date)}
      >
        <IconCopy size={18} stroke={2} color={BRAND_NAVY} />
        {labels.ne_use_template}
      </button>
    </div>,
    document.body,
  )
}
