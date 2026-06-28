import { useCallback, useEffect, useRef, useState } from 'react'
import NewEventModeSelect, {
  type NewEventMode,
} from './NewEventModeSelect'
import NewEventSessionContent from './NewEventSessionContent'
import OverlayPanel from '../shared/OverlayPanel'
import { useOverlay, type NewEventOpenMode } from '../shared/AppShell'
import { useTabManager } from '../TabManager'
import {
  getNewEventModeTab,
  NEW_EVENT_MODE_TAB_IDS,
  type NewEventModeKey,
} from '../../lib/newEventModes'
import type { EventTemplate } from '../../lib/types/eventTemplate'

interface NewEventSession {
  id: string
  mode: NewEventModeKey
  tabId: string
  label: string
  prefilledDate: Date | null
  initialTemplate: EventTemplate | null
}

function resolveLaunchMode(
  initialMode: NewEventOpenMode | null,
  hasInitialTemplate: boolean,
): NewEventModeKey | null {
  if (hasInitialTemplate) {
    return 'manual'
  }
  if (
    initialMode === 'quick' ||
    initialMode === 'beo' ||
    initialMode === 'manual'
  ) {
    return initialMode
  }
  return null
}

export default function NewEventOrchestrator() {
  const {
    activeOverlay,
    closeOverlay,
    focusNewEventOverlay,
    newEventPrefilledDate,
    newEventInitialMode,
    newEventInitialTemplate,
    openOverlay,
  } = useOverlay()
  const { hasTab, restoreTab, unregisterTab, canOpenNew, showMaxTabsNotice } =
    useTabManager()
  const launchHandledRef = useRef<string | null>(null)

  const [sessions, setSessions] = useState<NewEventSession[]>([])
  const [foregroundSessionId, setForegroundSessionId] = useState<string | null>(
    null,
  )
  const [showModeSelect, setShowModeSelect] = useState(false)
  const [duplicateNoticeMode, setDuplicateNoticeMode] =
    useState<NewEventModeKey | null>(null)

  const hasAnyNewEventTab = NEW_EVENT_MODE_TAB_IDS.some((tabId) => hasTab(tabId))

  const isModeInProgress = useCallback(
    (mode: NewEventModeKey) => {
      const tabId = getNewEventModeTab(mode).id
      return sessions.some((session) => session.mode === mode) || hasTab(tabId)
    },
    [hasTab, sessions],
  )

  const focusSession = useCallback(
    (sessionId: string) => {
      setDuplicateNoticeMode(null)
      setShowModeSelect(false)
      setForegroundSessionId(sessionId)
      focusNewEventOverlay()
    },
    [focusNewEventOverlay],
  )

  const createSession = useCallback(
    (
      mode: NewEventModeKey,
      options?: {
        prefilledDate?: Date | null
        initialTemplate?: EventTemplate | null
      },
    ) => {
      const tab = getNewEventModeTab(mode)
      const sessionId = crypto.randomUUID()
      const session: NewEventSession = {
        id: sessionId,
        mode,
        tabId: tab.id,
        label: tab.label,
        prefilledDate: options?.prefilledDate ?? newEventPrefilledDate,
        initialTemplate:
          options?.initialTemplate ?? newEventInitialTemplate ?? null,
      }

      setSessions((previous) => [...previous, session])
      setForegroundSessionId(sessionId)
      setShowModeSelect(false)
      setDuplicateNoticeMode(null)
      focusNewEventOverlay()
    },
    [focusNewEventOverlay, newEventInitialTemplate, newEventPrefilledDate],
  )

  const tryStartMode = useCallback(
    (
      mode: NewEventModeKey,
      options?: {
        prefilledDate?: Date | null
        initialTemplate?: EventTemplate | null
      },
    ) => {
      if (isModeInProgress(mode)) {
        setDuplicateNoticeMode(mode)
        return false
      }

      if (!canOpenNew()) {
        showMaxTabsNotice()
        return false
      }

      createSession(mode, options)
      return true
    },
    [canOpenNew, createSession, isModeInProgress, showMaxTabsNotice],
  )

  const closeSession = useCallback(
    (sessionId: string) => {
      const session = sessions.find((item) => item.id === sessionId)

      setSessions((previous) => {
        const remaining = previous.filter((item) => item.id !== sessionId)
        if (remaining.length === 0 && activeOverlay === 'new-event') {
          closeOverlay()
        }
        return remaining
      })

      if (foregroundSessionId === sessionId) {
        setForegroundSessionId(null)
      }

      if (session) {
        unregisterTab(session.tabId)
      }
    },
    [activeOverlay, closeOverlay, foregroundSessionId, sessions, unregisterTab],
  )

  const handleCloseModeSelect = useCallback(() => {
    setShowModeSelect(false)
    setDuplicateNoticeMode(null)
    closeOverlay()
  }, [closeOverlay])

  const handleModeSelect = useCallback(
    (mode: NewEventMode) => {
      tryStartMode(mode)
    },
    [tryStartMode],
  )

  const handleDuplicateRestore = useCallback(() => {
    if (!duplicateNoticeMode) {
      return
    }

    const tabId = getNewEventModeTab(duplicateNoticeMode).id
    const existingSession = sessions.find(
      (session) => session.mode === duplicateNoticeMode,
    )

    if (hasTab(tabId)) {
      restoreTab(tabId)
    }

    if (existingSession) {
      focusSession(existingSession.id)
      return
    }

    focusNewEventOverlay()
    setDuplicateNoticeMode(null)
  }, [
    duplicateNoticeMode,
    focusNewEventOverlay,
    focusSession,
    hasTab,
    restoreTab,
    sessions,
  ])

  useEffect(() => {
    if (activeOverlay !== 'new-event') {
      launchHandledRef.current = null
      return
    }

    const launchKey = [
      newEventInitialMode ?? '',
      newEventPrefilledDate?.toISOString() ?? '',
      newEventInitialTemplate?.id ?? '',
    ].join('|')

    const launchMode = resolveLaunchMode(
      newEventInitialMode,
      newEventInitialTemplate != null,
    )

    if (launchMode) {
      if (launchHandledRef.current === launchKey) {
        return
      }

      launchHandledRef.current = launchKey

      if (!tryStartMode(launchMode, {
        prefilledDate: newEventPrefilledDate,
        initialTemplate: newEventInitialTemplate,
      })) {
        setShowModeSelect(false)
      }
      return
    }

    launchHandledRef.current = launchKey
    setForegroundSessionId(null)
    setDuplicateNoticeMode(null)
    setShowModeSelect(true)
  }, [
    activeOverlay,
    newEventInitialMode,
    newEventInitialTemplate,
    newEventPrefilledDate,
    tryStartMode,
  ])

  useEffect(() => {
    if (!duplicateNoticeMode) {
      return
    }

    const timer = window.setTimeout(() => {
      setDuplicateNoticeMode(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [duplicateNoticeMode])

  const shouldRender =
    activeOverlay === 'new-event' ||
    sessions.length > 0 ||
    hasAnyNewEventTab

  if (!shouldRender) {
    return null
  }

  return (
    <>
      {showModeSelect && activeOverlay === 'new-event' ? (
        <OverlayPanel
          isOpen
          title="New Event"
          dismissable
          onClose={handleCloseModeSelect}
        >
          <NewEventModeSelect
            onSelect={handleModeSelect}
            onCancel={handleCloseModeSelect}
            onUseTemplate={() => {
              openOverlay('my-templates')
            }}
            highlightTemplate={newEventInitialMode === 'template'}
          />
        </OverlayPanel>
      ) : null}

      {sessions.map((session) => {
        const isForeground =
          foregroundSessionId === session.id &&
          activeOverlay === 'new-event' &&
          !showModeSelect
        const isPanelVisible = isForeground || hasTab(session.tabId)

        return (
          <OverlayPanel
            key={session.id}
            isOpen
            visible={isPanelVisible}
            title={session.label}
            dismissable={false}
            onClose={() => closeSession(session.id)}
            onPanelRestore={() => focusSession(session.id)}
            tabId={session.tabId}
            tabLabel={session.label}
            tabColor="#1B3A5C"
          >
            <NewEventSessionContent
              mode={session.mode}
              prefilledDate={session.prefilledDate ?? undefined}
              initialTemplate={session.initialTemplate ?? undefined}
              onCloseSession={() => closeSession(session.id)}
              onUseTemplate={() => {
                openOverlay('my-templates')
              }}
              highlightTemplate={newEventInitialMode === 'template'}
            />
          </OverlayPanel>
        )
      })}

      {duplicateNoticeMode ? (
        <DuplicateModeNotice
          mode={duplicateNoticeMode}
          onRestore={handleDuplicateRestore}
        />
      ) : null}
    </>
  )
}

function DuplicateModeNotice({
  mode,
  onRestore,
}: {
  mode: NewEventModeKey
  onRestore: () => void
}) {
  const modeLabel = getNewEventModeTab(mode).label

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        backgroundColor: '#1B3A5C',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 500,
        padding: '10px 16px',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      <span>You already have a {modeLabel} in progress.</span>
      <button
        type="button"
        onClick={onRestore}
        className="border-none bg-transparent p-0 underline"
        style={{
          color: '#ffffff',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Restore
      </button>
    </div>
  )
}
