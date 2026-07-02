import {
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { IconRobot, IconSend } from '@tabler/icons-react'
import {
  answerAssistantQuestion,
  isDbOnlyQuestion,
  matchStaffNamesInAnswer,
  type AssistantContext,
  type ConversationTurn,
  type StaffDirectoryEntry,
} from '../../lib/aiAssistant'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { openStaffProfileNavigation } from '../../lib/staffProfileNavigation'
import OverlayPanel from './OverlayPanel'

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

interface ThreadMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  status: 'done' | 'loading' | 'error'
  source?: 'db' | 'ai'
}

interface Conversation {
  id: string
  messages: ThreadMessage[]
  context: AssistantContext | null
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function buildCompletedTurns(messages: ThreadMessage[]): ConversationTurn[] {
  return messages
    .filter((message) => message.status === 'done')
    .map((message) => ({
      role: message.role,
      content: message.text,
    }))
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
      <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
      <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
    </div>
  )
}

function AnswerBody({
  text,
  source,
  staffDirectory,
  navyColor,
  onStaffClick,
}: {
  text: string
  source?: 'db' | 'ai'
  staffDirectory: StaffDirectoryEntry[]
  navyColor: string
  onStaffClick: (phone: string) => void
}) {
  if (source !== 'ai' || staffDirectory.length === 0) {
    return (
      <span className="whitespace-pre-wrap" style={{ fontSize: '13px', lineHeight: 1.5 }}>
        {text}
      </span>
    )
  }

  const matches = matchStaffNamesInAnswer(text, staffDirectory)
  if (matches.length === 0) {
    return (
      <span className="whitespace-pre-wrap" style={{ fontSize: '13px', lineHeight: 1.5 }}>
        {text}
      </span>
    )
  }

  const nodes: Array<string | ReactElement> = []
  let cursor = 0

  for (const match of matches) {
    if (match.start > cursor) {
      nodes.push(text.slice(cursor, match.start))
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

  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }

  return (
    <span className="whitespace-pre-wrap" style={{ fontSize: '13px', lineHeight: 1.5 }}>
      {nodes}
    </span>
  )
}

export default function AIAssistant({ onOpenStaffOverlay }: AIAssistantProps) {
  const { colors } = useProductConfig()
  const [question, setQuestion] = useState('')
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const [examplesOpen, setExamplesOpen] = useState(false)
  const [emptyInputMessage, setEmptyInputMessage] = useState(false)
  const [recentQuestions, setRecentQuestions] = useState<string[]>([])
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conversationIndex, setConversationIndex] = useState(-1)
  const examplesRef = useRef<HTMLDivElement>(null)
  const emptyMessageTimerRef = useRef<number | null>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const conversationIndexRef = useRef(-1)

  conversationIndexRef.current = conversationIndex
  const currentConversation =
    conversationIndex >= 0 ? conversations[conversationIndex] : null

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentConversation?.messages])

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

  const submitQuestion = useCallback(
    async (
      nextQuestion: string,
      options: {
        freshConversation?: boolean
        followUp?: boolean
        retryAssistantMessageId?: string
      } = {},
    ) => {
      let trimmed = nextQuestion.trim()
      if (!trimmed && !options.retryAssistantMessageId) {
        return
      }

      const assistantMessageId =
        options.retryAssistantMessageId ?? createMessageId()
      const userMessageId = createMessageId()
      const now = Date.now()
      const isDbQuery = isDbOnlyQuestion(trimmed)
      let priorTurns: ConversationTurn[] = []
      let targetConversationIndex = conversationIndexRef.current

      if (!options.retryAssistantMessageId) {
        setRecentQuestions((previous) => {
          const withoutDuplicate = previous.filter(
            (item) => item.toLowerCase() !== trimmed.toLowerCase(),
          )
          return [trimmed, ...withoutDuplicate].slice(0, 5)
        })
      }

      setConversations((previous) => {
        let next = [...previous]

        if (options.freshConversation) {
          const newConversation: Conversation = {
            id: createMessageId(),
            messages: [],
            context: null,
          }
          next =
            targetConversationIndex >= 0
              ? [...next.slice(0, targetConversationIndex + 1), newConversation]
              : [newConversation]
          targetConversationIndex = next.length - 1
          setConversationIndex(targetConversationIndex)
          conversationIndexRef.current = targetConversationIndex
        } else if (targetConversationIndex < 0 || targetConversationIndex >= next.length) {
          const newConversation: Conversation = {
            id: createMessageId(),
            messages: [],
            context: null,
          }
          next = [newConversation]
          targetConversationIndex = 0
          setConversationIndex(0)
          conversationIndexRef.current = 0
        }

        const conversation = next[targetConversationIndex]
        let messages = [...conversation.messages]

        if (options.retryAssistantMessageId) {
          const errorIndex = messages.findIndex(
            (message) => message.id === options.retryAssistantMessageId,
          )
          const userMessage =
            errorIndex > 0 ? messages[errorIndex - 1] : null
          if (!userMessage || userMessage.role !== 'user') {
            return previous
          }
          trimmed = userMessage.text
          priorTurns = buildCompletedTurns(messages.slice(0, errorIndex - 1))
          messages = messages.map((message) =>
            message.id === options.retryAssistantMessageId
              ? {
                  ...message,
                  text: '',
                  status: 'loading' as const,
                  source: undefined,
                }
              : message,
          )
        } else {
          priorTurns = buildCompletedTurns(conversation.messages)
          messages.push({
            id: userMessageId,
            role: 'user',
            text: trimmed,
            timestamp: now,
            status: 'done',
          })
          if (!isDbQuery) {
            messages.push({
              id: assistantMessageId,
              role: 'assistant',
              text: '',
              timestamp: now,
              status: 'loading',
            })
          }
        }

        next[targetConversationIndex] = {
          ...conversation,
          messages,
        }
        return next
      })

      if (options.retryAssistantMessageId && !trimmed) {
        return
      }

      try {
        const { answer, context } = await answerAssistantQuestion(
          trimmed,
          priorTurns,
        )
        setConversations((previous) => {
          const next = [...previous]
          const index = conversationIndexRef.current
          if (index < 0 || index >= next.length) {
            return previous
          }
          const conversation = next[index]
          let messages = [...conversation.messages]

          if (options.retryAssistantMessageId) {
            messages = messages.map((message) =>
              message.id === options.retryAssistantMessageId
                ? {
                    ...message,
                    text: answer.text,
                    status: 'done' as const,
                    source: answer.source,
                    timestamp: Date.now(),
                  }
                : message,
            )
          } else if (isDbQuery) {
            messages.push({
              id: assistantMessageId,
              role: 'assistant',
              text: answer.text,
              timestamp: Date.now(),
              status: 'done',
              source: answer.source,
            })
          } else {
            messages = messages.map((message) =>
              message.id === assistantMessageId
                ? {
                    ...message,
                    text: answer.text,
                    status: 'done' as const,
                    source: answer.source,
                    timestamp: Date.now(),
                  }
                : message,
            )
          }

          next[index] = {
            ...conversation,
            messages,
            context,
          }
          return next
        })
      } catch (error) {
        console.error('[AIAssistant] answer failed', error)
        setConversations((previous) => {
          const next = [...previous]
          const index = conversationIndexRef.current
          if (index < 0 || index >= next.length) {
            return previous
          }
          const conversation = next[index]
          let messages = [...conversation.messages]

          if (options.retryAssistantMessageId) {
            messages = messages.map((message) =>
              message.id === options.retryAssistantMessageId
                ? { ...message, status: 'error' as const, text: '' }
                : message,
            )
          } else if (isDbQuery) {
            messages.push({
              id: assistantMessageId,
              role: 'assistant',
              text: '',
              timestamp: Date.now(),
              status: 'error',
            })
          } else {
            messages = messages.map((message) =>
              message.id === assistantMessageId
                ? { ...message, status: 'error' as const, text: '' }
                : message,
            )
          }

          next[index] = { ...conversation, messages }
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
      void submitQuestion(trimmed, {
        freshConversation: panelOpen,
      })
    },
    [panelOpen, question, submitQuestion],
  )

  const handleFollowUpSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault()
      const trimmed = followUpQuestion.trim()
      if (!trimmed) {
        return
      }
      setFollowUpQuestion('')
      void submitQuestion(trimmed, { followUp: true })
    },
    [followUpQuestion, submitQuestion],
  )

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSubmit()
    }
  }

  const handleFollowUpKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleFollowUpSubmit()
    }
  }

  const handlePanelClose = useCallback(() => {
    setPanelOpen(false)
  }, [])

  const handlePanelRestore = useCallback(() => {
    setPanelOpen(true)
  }, [])

  const staffDirectory = currentConversation?.context?.staffDirectory ?? []

  return (
    <>
      <div
        className="shrink-0"
        style={{
          backgroundColor: colors.brand_light_blue,
          paddingTop: '8px',
          paddingBottom: '8px',
          paddingLeft: '16px',
          paddingRight: '16px',
        }}
      >
        <div
          className="relative shrink-0"
          style={{
            height: '40px',
            boxSizing: 'border-box',
            borderRadius: '8px',
            background:
              'linear-gradient(to right, var(--shell-brand-navy), var(--shell-brand-red))',
          }}
        >
        <form
          onSubmit={handleSubmit}
          className="flex h-full items-center gap-2"
          style={{ paddingLeft: '40px', paddingRight: '40px' }}
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
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
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
      </div>

      <OverlayPanel
        isOpen={panelOpen}
        title="AI Assistant"
        dismissable
        tabId="ai-assistant"
        tabLabel="AI Assistant"
        tabColor="#1B3A5C"
        onClose={handlePanelClose}
        onPanelRestore={handlePanelRestore}
      >
        <div
          className="flex flex-col"
          style={{ minHeight: 'calc(100vh - 53px)' }}
        >
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {currentConversation?.messages.length ? (
                  <div className="flex flex-col gap-4">
                    {currentConversation.messages.map((message) => {
                      if (message.role === 'user') {
                        return (
                          <div
                            key={message.id}
                            className="flex flex-col items-end"
                          >
                            <div
                              style={{
                                maxWidth: '80%',
                                padding: '8px 12px',
                                borderRadius: '12px 12px 2px 12px',
                                backgroundColor: colors.brand_navy,
                                color: '#ffffff',
                                fontSize: '13px',
                                lineHeight: 1.5,
                              }}
                            >
                              {message.text}
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#9CA3AF',
                                marginTop: '4px',
                              }}
                            >
                              {formatMessageTime(message.timestamp)}
                            </span>
                          </div>
                        )
                      }

                      if (message.status === 'loading') {
                        return (
                          <div
                            key={message.id}
                            className="flex flex-col items-start"
                          >
                            <div
                              style={{
                                maxWidth: '80%',
                                padding: '8px 12px',
                                borderRadius: '12px 12px 12px 2px',
                                backgroundColor: '#F3F4F6',
                                color: '#1F2937',
                                fontSize: '13px',
                              }}
                            >
                              <ThinkingDots />
                            </div>
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#9CA3AF',
                                marginTop: '4px',
                              }}
                            >
                              {formatMessageTime(message.timestamp)}
                            </span>
                          </div>
                        )
                      }

                      if (message.status === 'error') {
                        return (
                          <div
                            key={message.id}
                            className="flex flex-col items-start"
                          >
                            <div
                              style={{
                                maxWidth: '80%',
                                padding: '8px 12px',
                                borderRadius: '12px 12px 12px 2px',
                                backgroundColor: '#F3F4F6',
                                color: '#1F2937',
                                fontSize: '13px',
                                lineHeight: 1.5,
                              }}
                            >
                              Something went wrong — please try again.{' '}
                              <button
                                type="button"
                                onClick={() => {
                                  void submitQuestion('', {
                                    retryAssistantMessageId: message.id,
                                  })
                                }}
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
                            <span
                              style={{
                                fontSize: '10px',
                                color: '#9CA3AF',
                                marginTop: '4px',
                              }}
                            >
                              {formatMessageTime(message.timestamp)}
                            </span>
                          </div>
                        )
                      }

                      return (
                        <div
                          key={message.id}
                          className="flex flex-col items-start"
                        >
                          <div
                            style={{
                              maxWidth: '80%',
                              padding: '8px 12px',
                              borderRadius: '12px 12px 12px 2px',
                              backgroundColor: '#F3F4F6',
                              color: '#1F2937',
                            }}
                          >
                            <AnswerBody
                              text={message.text}
                              source={message.source}
                              staffDirectory={staffDirectory}
                              navyColor={colors.brand_navy}
                              onStaffClick={handleStaffClick}
                            />
                          </div>
                          {message.source === 'ai' ? (
                            <span
                              style={{
                                fontSize: '11px',
                                color: '#9CA3AF',
                                marginTop: '4px',
                              }}
                            >
                              Powered by Claude
                            </span>
                          ) : null}
                          <span
                            style={{
                              fontSize: '10px',
                              color: '#9CA3AF',
                              marginTop: '4px',
                            }}
                          >
                            {formatMessageTime(message.timestamp)}
                          </span>
                        </div>
                      )
                    })}
                    <div ref={threadEndRef} />
                  </div>
                ) : (
                  <div>
                    {recentQuestions.length > 0 ? (
                      <section>
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
                          {recentQuestions.map((item) => (
                            <li key={item}>
                              <button
                                type="button"
                                onClick={() => {
                                  setQuestion(item)
                                  setPanelOpen(true)
                                  void submitQuestion(item, {
                                    freshConversation: true,
                                  })
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
                    ) : (
                      <p style={{ fontSize: '13px', color: '#9CA3AF' }}>
                        Ask a question using the bar above to get started.
                      </p>
                    )}
                  </div>
                )}
              </div>

          {currentConversation?.messages.length ? (
            <div
              className="shrink-0 border-t border-gray-200 px-4 py-3"
              style={{ backgroundColor: '#ffffff' }}
            >
              <form onSubmit={handleFollowUpSubmit} className="relative">
                <input
                  type="text"
                  value={followUpQuestion}
                  onChange={(event) =>
                    setFollowUpQuestion(event.target.value)
                  }
                  onKeyDown={handleFollowUpKeyDown}
                  placeholder="Ask a follow-up question..."
                  className="w-full outline-none"
                  style={{
                    height: '36px',
                    fontSize: '13px',
                    padding: '0 40px 0 12px',
                    borderRadius: '8px',
                    border: '1px solid #E5E7EB',
                    backgroundColor: '#ffffff',
                    color: '#1F2937',
                  }}
                />
                <button
                  type="submit"
                  aria-label="Send follow-up"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 hover:bg-gray-100"
                  style={{
                    color: colors.brand_navy,
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <IconSend size={18} stroke={2} />
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </OverlayPanel>
    </>
  )
}
