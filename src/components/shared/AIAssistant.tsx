import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  IconChevronLeft,
  IconChevronRight,
  IconRobot,
  IconX,
} from '@tabler/icons-react'
import {
  answerAssistantQuestion,
  isDbOnlyQuestion,
  matchStaffNamesInAnswer,
  type AssistantAnswer,
  type AssistantContext,
  type StaffDirectoryEntry,
} from '../../lib/aiAssistant'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { openStaffProfileNavigation } from '../../lib/staffProfileNavigation'
import {
  OVERLAY_PANEL_MAX_WIDTH_PX,
  OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX,
} from './OverlayPanel'

interface AIAssistantProps {
  onOpenStaffOverlay: () => void
}

const EXAMPLE_QUESTIONS = [
  'How many captains do I have?',
  'Who worked the holiday party last December?',
  'Who are my best captains for a 200-person gala on October 15th?',
  "Which staff haven't updated their availability this month?",
  'Who should I call first if my captain cancels tonight?',
] as const

interface QASession {
  question: string
  answer: AssistantAnswer | null
  context: AssistantContext | null
  status: 'loading' | 'done' | 'error'
}

function AnswerBody({
  answer,
  staffDirectory,
  navyColor,
  onStaffClick,
}: {
  answer: AssistantAnswer
  staffDirectory: StaffDirectoryEntry[]
  navyColor: string
  onStaffClick: (phone: string) => void
}) {
  if (answer.source !== 'ai' || staffDirectory.length === 0) {
    return (
      <p
        className="whitespace-pre-wrap"
        style={{ fontSize: '14px', color: '#374151', lineHeight: 1.5 }}
      >
        {answer.text}
      </p>
    )
  }

  const matches = matchStaffNamesInAnswer(answer.text, staffDirectory)
  if (matches.length === 0) {
    return (
      <p
        className="whitespace-pre-wrap"
        style={{ fontSize: '14px', color: '#374151', lineHeight: 1.5 }}
      >
        {answer.text}
      </p>
    )
  }

  const nodes: Array<string | ReactElement> = []
  let cursor = 0

  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(answer.text.slice(cursor, match.start))
    }
    nodes.push(
      <button
        key={`${match.phone}-${match.start}`}
        type="button"
        onClick={() => onStaffClick(match.phone)}
        className="border-none bg-transparent p-0"
        style={{
          color: navyColor,
          textDecoration: 'underline',
          cursor: 'pointer',
          fontSize: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        {match.label}
      </button>,
    )
    cursor = match.end
  }

  if (cursor < answer.text.length) {
    nodes.push(answer.text.slice(cursor))
  }

  return (
    <p
      className="whitespace-pre-wrap"
      style={{ fontSize: '14px', color: '#374151', lineHeight: 1.5 }}
    >
      {nodes}
    </p>
  )
}

export default function AIAssistant({ onOpenStaffOverlay }: AIAssistantProps) {
  const { colors } = useProductConfig()
  const [question, setQuestion] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [slideIn, setSlideIn] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [emptyInputMessage, setEmptyInputMessage] = useState(false)
  const [recentQuestions, setRecentQuestions] = useState<string[]>([])
  const [sessions, setSessions] = useState<QASession[]>([])
  const [sessionIndex, setSessionIndex] = useState(-1)
  const examplesRef = useRef<HTMLDivElement>(null)
  const emptyMessageTimerRef = useRef<number | null>(null)
  const sessionIndexRef = useRef(-1)

  sessionIndexRef.current = sessionIndex
  const currentSession = sessionIndex >= 0 ? sessions[sessionIndex] : null

  useEffect(() => {
    if (!panelOpen) {
      setSlideIn(false)
      return
    }

    const frame = requestAnimationFrame(() => {
      setSlideIn(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [panelOpen])

  useEffect(() => {
    if (!examplesOpen) {
      return
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        examplesRef.current &&
        !examplesRef.current.contains(event.target as Node)
      ) {
        setExamplesOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [examplesOpen])

  useEffect(() => {
    if (!panelOpen) {
      return
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        setPanelOpen(false)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [panelOpen])

  useEffect(() => {
    return () => {
      if (emptyMessageTimerRef.current != null) {
        window.clearTimeout(emptyMessageTimerRef.current)
      }
    }
  }, [])

  const handleStaffClick = useCallback(
    (phone: string) => {
      onOpenStaffOverlay()
      window.setTimeout(() => {
        openStaffProfileNavigation({ phone, tab: 'availability' })
      }, 150)
    },
    [onOpenStaffOverlay],
  )

  const runQuestion = useCallback(
    async (nextQuestion: string, options?: { retry?: boolean }) => {
      const trimmed = nextQuestion.trim()
      if (!trimmed) {
        return
      }

      if (!options?.retry) {
        setRecentQuestions((previous) => {
          const withoutDuplicate = previous.filter(
            (item) => item.toLowerCase() !== trimmed.toLowerCase(),
          )
          return [trimmed, ...withoutDuplicate].slice(0, 5)
        })
      }

      const newSession: QASession = {
        question: trimmed,
        answer: null,
        context: null,
        status: 'loading',
      }

      if (options?.retry) {
        setSessions((previous) => {
          const activeIndex = sessionIndexRef.current
          if (activeIndex < 0 || activeIndex >= previous.length) {
            return previous
          }
          const next = [...previous]
          next[activeIndex] = newSession
          return next
        })
      } else {
        setSessions((previous) => {
          const activeIndex = sessionIndexRef.current
          const truncated =
            activeIndex >= 0 ? previous.slice(0, activeIndex + 1) : previous
          const nextSessions = [...truncated, newSession]
          setSessionIndex(nextSessions.length - 1)
          return nextSessions
        })
      }

      try {
        const { answer, context } = await answerAssistantQuestion(trimmed)
        setSessions((previous) => {
          const next = [...previous]
          const index = options?.retry
            ? sessionIndexRef.current
            : next.length - 1
          if (index < 0 || index >= next.length) {
            return previous
          }
          if (next[index].question !== trimmed) {
            return previous
          }
          next[index] = {
            question: trimmed,
            answer,
            context,
            status: 'done',
          }
          return next
        })
      } catch (error) {
        console.error('[AIAssistant] answer failed', error)
        setSessions((previous) => {
          const next = [...previous]
          const index = options?.retry
            ? sessionIndexRef.current
            : next.findIndex(
                (session) =>
                  session.question === trimmed && session.status === 'loading',
              )
          if (index < 0 || index >= next.length) {
            return previous
          }
          next[index] = {
            question: trimmed,
            answer: null,
            context: null,
            status: 'error',
          }
          return next
        })
      }
    },
    [],
  )

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault()
      const trimmed = question.trim()
      if (!trimmed) {
        setEmptyInputMessage(true)
        if (emptyMessageTimerRef.current != null) {
          window.clearTimeout(emptyMessageTimerRef.current)
        }
        emptyMessageTimerRef.current = window.setTimeout(() => {
          setEmptyInputMessage(false)
          emptyMessageTimerRef.current = null
        }, 2000)
        return
      }

      setPanelOpen(true)
      void runQuestion(trimmed)
    },
    [question, runQuestion],
  )

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handleRetry = () => {
    if (!currentSession) {
      return
    }
    void runQuestion(currentSession.question, { retry: true })
  }

  const handleBack = () => {
    if (sessionIndex > 0) {
      setSessionIndex(sessionIndex - 1)
    }
  }

  const canGoBack = sessionIndex > 0
  const panelRecentQuestions = recentQuestions.filter(
    (item) => item !== currentSession?.question,
  )

  return (
    <>
      <div
        className="relative shrink-0"
        style={{
          height: '40px',
          boxSizing: 'border-box',
          background:
            'linear-gradient(to right, var(--shell-brand-navy), var(--shell-brand-red))',
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="flex h-full items-center gap-2"
          style={{ paddingLeft: '16px', paddingRight: '16px' }}
        >
          <span
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap"
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            <IconRobot size={14} stroke={2} aria-hidden="true" />
            Ask Your AI Assistant:
          </span>

          <input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Type your question here..."
            className="min-w-0 flex-1 outline-none placeholder:text-white/70"
            style={{
              height: '26px',
              fontSize: '13px',
              padding: '0 10px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              color: '#ffffff',
            }}
          />

          <div className="relative shrink-0" ref={examplesRef}>
            <button
              type="button"
              onClick={() => setExamplesOpen((open) => !open)}
              className="whitespace-nowrap"
              style={{
                height: '26px',
                fontSize: '12px',
                padding: '0 10px',
                borderRadius: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                color: 'rgba(255, 255, 255, 0.9)',
                cursor: 'pointer',
              }}
            >
              Examples ▾
            </button>

            {examplesOpen ? (
              <div
                className="absolute right-0 z-50 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg"
                style={{ minWidth: '320px', top: '100%' }}
              >
                {EXAMPLE_QUESTIONS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => {
                      setQuestion(example)
                      setExamplesOpen(false)
                    }}
                    className="block w-full border-none bg-white px-3 py-2 text-left hover:bg-gray-50"
                    style={{
                      fontSize: '12px',
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    {example}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            className="shrink-0 whitespace-nowrap"
            style={{
              height: '26px',
              fontSize: '12px',
              fontWeight: 600,
              padding: '0 14px',
              borderRadius: '6px',
              backgroundColor: '#ffffff',
              color: colors.brand_navy,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Ask
          </button>
        </form>

        {emptyInputMessage ? (
          <p
            className="absolute left-4 transition-opacity duration-300"
            style={{
              top: '40px',
              fontSize: '11px',
              color: colors.brand_red,
              margin: 0,
            }}
          >
            Please type a question first
          </p>
        ) : null}
      </div>

      {panelOpen ? (
        <>
          <button
            type="button"
            aria-label="Close AI assistant panel"
            onClick={() => setPanelOpen(false)}
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
              maxWidth: `${OVERLAY_PANEL_MAX_WIDTH_PX}px`,
              paddingRight: `${OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX}px`,
              boxSizing: 'border-box',
              zIndex: 301,
              transform: slideIn ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.2s ease',
            }}
          >
            <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={!canGoBack}
                  aria-label="Previous answer"
                  className="rounded p-1 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"
                  style={{
                    color: colors.brand_navy,
                    border: 'none',
                    background: 'none',
                  }}
                >
                  <IconChevronLeft size={20} stroke={2} />
                </button>
                <h2
                  className="flex min-w-0 items-center gap-2 truncate"
                  style={{
                    fontSize: '16px',
                    fontWeight: 600,
                    color: colors.brand_navy,
                  }}
                >
                  <IconRobot size={18} stroke={2} aria-hidden="true" />
                  AI Assistant
                </h2>
                <button
                  type="button"
                  disabled
                  aria-label="Next answer"
                  className="rounded p-1 opacity-30"
                  style={{
                    color: colors.brand_navy,
                    border: 'none',
                    background: 'none',
                    cursor: 'not-allowed',
                  }}
                >
                  <IconChevronRight size={20} stroke={2} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Close"
                className="rounded p-1 hover:bg-gray-100"
                style={{ color: colors.brand_navy, border: 'none', background: 'none' }}
              >
                <IconX size={20} stroke={2} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {panelRecentQuestions.length > 0 ? (
                <section className="mb-6">
                  <p
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      color: '#9CA3AF',
                      marginBottom: '8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Recent
                  </p>
                  <ul className="m-0 list-none space-y-2 p-0">
                    {panelRecentQuestions.map((item) => (
                      <li key={item}>
                        <button
                          type="button"
                          onClick={() => {
                            setQuestion(item)
                            setPanelOpen(true)
                            void runQuestion(item)
                          }}
                          className="border-none bg-transparent p-0 text-left hover:underline"
                          style={{
                            fontSize: '13px',
                            color: '#6B7280',
                            cursor: 'pointer',
                          }}
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {currentSession ? (
                <section>
                  <p
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#6B7280',
                      marginBottom: '8px',
                    }}
                  >
                    {currentSession.question}
                  </p>

                  {currentSession.status === 'loading' &&
                  !isDbOnlyQuestion(currentSession.question) ? (
                    <p
                      className="animate-pulse"
                      style={{ fontSize: '14px', color: '#6B7280' }}
                    >
                      Thinking…
                    </p>
                  ) : null}

                  {currentSession.status === 'error' ? (
                    <div style={{ fontSize: '14px', color: '#374151' }}>
                      Something went wrong — please try again.{' '}
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="border-none bg-transparent p-0 underline"
                        style={{
                          color: colors.brand_navy,
                          cursor: 'pointer',
                          fontSize: 'inherit',
                        }}
                      >
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {currentSession.status === 'done' && currentSession.answer ? (
                    <>
                      <AnswerBody
                        answer={currentSession.answer}
                        staffDirectory={
                          currentSession.context?.staffDirectory ?? []
                        }
                        navyColor={colors.brand_navy}
                        onStaffClick={handleStaffClick}
                      />
                      {currentSession.answer.source === 'ai' ? (
                        <p
                          style={{
                            fontSize: '11px',
                            color: '#9CA3AF',
                            marginTop: '16px',
                          }}
                        >
                          Powered by Claude
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </section>
              ) : panelRecentQuestions.length === 0 && !currentSession ? (
                <p style={{ fontSize: '13px', color: '#9CA3AF' }}>
                  Ask a question using the bar above to get started.
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
