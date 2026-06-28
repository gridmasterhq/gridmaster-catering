import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { IconChevronLeft } from '@tabler/icons-react'

const MAX_TABS = 6
const NAVY = '#1B3A5C'

interface TabEntry {
  id: string
  label: string
  color: string
  onRestore: () => void
}

interface TabManagerContextValue {
  registerTab: (
    id: string,
    label: string,
    color: string,
    onRestore: () => void,
  ) => void
  unregisterTab: (id: string) => void
  canOpenNew: () => boolean
  showMaxTabsNotice: () => void
}

const TabManagerContext = createContext<TabManagerContextValue | null>(null)

export function useTabManager(): TabManagerContextValue {
  const context = useContext(TabManagerContext)

  if (!context) {
    throw new Error('useTabManager must be used within TabManagerProvider')
  }

  return context
}

interface TabManagerProviderProps {
  children: ReactNode
}

export function TabManagerProvider({ children }: TabManagerProviderProps) {
  const [tabs, setTabs] = useState<TabEntry[]>([])
  const [showNotice, setShowNotice] = useState(false)

  const registerTab = useCallback(
    (
      id: string,
      label: string,
      color: string,
      onRestore: () => void,
    ) => {
      setTabs((previous) => {
        const filtered = previous.filter((tab) => tab.id !== id)
        return [{ id, label, color, onRestore }, ...filtered]
      })
    },
    [],
  )

  const unregisterTab = useCallback((id: string) => {
    setTabs((previous) => previous.filter((tab) => tab.id !== id))
  }, [])

  const canOpenNew = useCallback(() => tabs.length < MAX_TABS, [tabs.length])

  const showMaxTabsNotice = useCallback(() => {
    setShowNotice(true)
  }, [])

  useEffect(() => {
    if (!showNotice) {
      return
    }

    const timer = window.setTimeout(() => {
      setShowNotice(false)
    }, 3000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [showNotice])

  const value = useMemo(
    () => ({
      registerTab,
      unregisterTab,
      canOpenNew,
      showMaxTabsNotice,
    }),
    [registerTab, unregisterTab, canOpenNew, showMaxTabsNotice],
  )

  return (
    <TabManagerContext.Provider value={value}>
      {children}

      {tabs.length > 0 ? (
        <div
          aria-label="Minimized panels"
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            height: '100vh',
            width: '32px',
            zIndex: 1000,
            pointerEvents: 'none',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              onClick={tab.onRestore}
              aria-label={`Restore ${tab.label}`}
              className="flex flex-col items-center justify-center border-none"
              style={{
                height: 'calc(100vh / 6)',
                width: '32px',
                flexShrink: 0,
                backgroundColor: tab.color,
                pointerEvents: 'auto',
                cursor: 'pointer',
                borderTop: index > 0 ? '1px solid #ffffff' : undefined,
                gap: '6px',
                padding: '8px 4px',
              }}
            >
              <IconChevronLeft size={14} color="#ffffff" stroke={2} />
              <span
                style={{
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed',
                  transform: 'rotate(180deg)',
                  color: '#ffffff',
                  fontSize: '11px',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}
              >
                {tab.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {showNotice ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            backgroundColor: NAVY,
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            padding: '10px 16px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}
        >
          You have 6 tabs open — please close or restore one first.
        </div>
      ) : null}
    </TabManagerContext.Provider>
  )
}
