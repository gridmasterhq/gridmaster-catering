import { useEffect, useState } from 'react'
import { IconBolt } from '@tabler/icons-react'
import '../App.css'

interface ExpertModeToggleProps {
  pageName: string
  onModeChange: (isExpert: boolean) => void
}

function getStorageKey(pageName: string) {
  return `expertMode_${pageName}`
}

function readStoredExpertMode(pageName: string): boolean {
  try {
    return localStorage.getItem(getStorageKey(pageName)) === 'true'
  } catch {
    return false
  }
}

const togglePosition = {
  position: 'absolute' as const,
  top: 12,
  right: 16,
  zIndex: 10,
}

export default function ExpertModeToggle({
  pageName,
  onModeChange,
}: ExpertModeToggleProps) {
  const storageKey = getStorageKey(pageName)
  const [isExpert, setIsExpert] = useState(() =>
    readStoredExpertMode(pageName),
  )

  useEffect(() => {
    onModeChange(isExpert)
  }, [isExpert, onModeChange])

  function enableExpertMode() {
    setIsExpert(true)
    try {
      localStorage.setItem(storageKey, 'true')
    } catch {
      // ignore storage errors
    }
  }

  function disableExpertMode() {
    setIsExpert(false)
    try {
      localStorage.setItem(storageKey, 'false')
    } catch {
      // ignore storage errors
    }
  }

  if (isExpert) {
    return (
      <button
        type="button"
        className="expert-mode-toggle"
        style={{
          ...togglePosition,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 4,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
        onClick={disableExpertMode}
        aria-label="Exit Expert Mode"
      >
        <IconBolt size={14} color="#1B3A5C" stroke={2} />
      </button>
    )
  }

  return (
    <div
      className="expert-mode-toggle flex items-center gap-2"
      style={togglePosition}
    >
      <span style={{ fontSize: '11px', color: '#9ca3af' }}>Expert</span>
      <button
        type="button"
        role="switch"
        aria-checked={false}
        aria-label="Enable Expert Mode"
        onClick={enableExpertMode}
        style={{
          position: 'relative',
          width: 28,
          height: 16,
          borderRadius: 8,
          backgroundColor: '#d1d5db',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: 2,
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            transition: 'transform 0.15s ease',
          }}
        />
      </button>
    </div>
  )
}
