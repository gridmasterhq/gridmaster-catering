import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type ExpertModeScreen = 'cc' | 'cal'

const STORAGE_KEYS: Record<ExpertModeScreen, string> = {
  cc: 'expertMode_cc',
  cal: 'expertMode_cal',
}

interface ExpertModeContextValue {
  isExpertMode: (screen: ExpertModeScreen) => boolean
  setExpertMode: (screen: ExpertModeScreen, enabled: boolean) => void
}

const ExpertModeContext = createContext<ExpertModeContextValue | null>(null)

function readStoredExpertMode(screen: ExpertModeScreen): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS[screen]) === 'true'
  } catch {
    return false
  }
}

function writeStoredExpertMode(screen: ExpertModeScreen, enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEYS[screen], String(enabled))
  } catch {
    // ignore storage errors
  }
}

export function ExpertModeProvider({ children }: { children: ReactNode }) {
  const [ccExpert, setCcExpert] = useState(() => readStoredExpertMode('cc'))
  const [calExpert, setCalExpert] = useState(() => readStoredExpertMode('cal'))

  const setExpertMode = useCallback(
    (screen: ExpertModeScreen, enabled: boolean) => {
      writeStoredExpertMode(screen, enabled)
      if (screen === 'cc') {
        setCcExpert(enabled)
      } else {
        setCalExpert(enabled)
      }
    },
    [],
  )

  const isExpertMode = useCallback(
    (screen: ExpertModeScreen) => (screen === 'cc' ? ccExpert : calExpert),
    [ccExpert, calExpert],
  )

  const value = useMemo(
    () => ({ isExpertMode, setExpertMode }),
    [isExpertMode, setExpertMode],
  )

  return (
    <ExpertModeContext.Provider value={value}>
      {children}
    </ExpertModeContext.Provider>
  )
}

export function useExpertMode(screen: ExpertModeScreen) {
  const context = useContext(ExpertModeContext)

  if (!context) {
    throw new Error('useExpertMode must be used within ExpertModeProvider')
  }

  return {
    isExpert: context.isExpertMode(screen),
    setExpertMode: (enabled: boolean) =>
      context.setExpertMode(screen, enabled),
  }
}
