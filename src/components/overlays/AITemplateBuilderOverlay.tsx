import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  IconCheck,
  IconSend,
  IconSparkles,
} from '@tabler/icons-react'
import { useOverlay } from '../shared/AppShell'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import {
  AI_TEMPLATE_BUILDER_SYSTEM_PROMPT,
  aiTemplateToEventTemplate,
  insertAiGeneratedTemplate,
  parseTemplateBuilderResponse,
  type AIGeneratedTemplate,
  type AnthropicChatMessage,
} from '../../lib/aiTemplateBuilder'
import { type EventTemplate, EVENT_TEMPLATE_SELECT } from '../../lib/types/eventTemplate'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

type BuilderMode = 'select' | 'freeform' | 'guided'

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  content: string
  showModeButtons?: boolean
}

const OPENING_MESSAGE = `Let's build a template. How would you like to work?

You can describe your event and I'll fill in the blanks — or I can ask you questions one at a time and we'll build it together.

Which do you prefer?`

const FREEFORM_FOLLOWUP = `Perfect. Tell me about the event — the type, how many guests, how many staff you typically need, service style, bar setup, venue if it's recurring, and anything else you want locked into this template. Don't worry about covering everything — I'll ask about anything I'm missing.`

const GUIDED_FIRST_QUESTION = `Great — let's go one step at a time.

What type of event is this template for? For example: wedding, corporate dinner, gala, cocktail reception, holiday party, or something else?`

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function createOpeningMessages(): ChatMessage[] {
  return [
    {
      id: createMessageId(),
      role: 'assistant',
      content: OPENING_MESSAGE,
      showModeButtons: true,
    },
  ]
}

function TypingIndicator() {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
        style={{ backgroundColor: '#1B3A5C' }}
      >
        GM
      </div>
      <div
        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-4 py-3"
        style={{ borderColor: '#E5E7EB' }}
      >
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
        <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
      </div>
    </div>
  )
}

interface TemplatePreviewCardProps {
  template: AIGeneratedTemplate
  saved: boolean
  saving: boolean
  onSave: () => void
  onUseNow: () => void
  onStartOver: () => void
}

function TemplatePreviewCard({
  template,
  saved,
  saving,
  onSave,
  onUseNow,
  onStartOver,
  labels,
  colors,
  event_types,
  service_styles,
}: TemplatePreviewCardProps & {
  labels: ReturnType<typeof useProductConfig>['labels']
  colors: ReturnType<typeof useProductConfig>['colors']
  event_types: ReturnType<typeof useProductConfig>['event_types']
  service_styles: ReturnType<typeof useProductConfig>['service_styles']
}) {
  const eventTypeLabel =
    event_types.find((type) => type.value === template.event_type)?.label ??
    template.event_type
  const serviceStyleLabel =
    service_styles.find((style) => style.value === template.service_style)
      ?.label ?? template.service_style

  const tagPillStyle = {
    fontSize: '11px',
    color: colors.text_muted,
    backgroundColor: '#F3F4F6',
    borderRadius: '9999px',
    padding: '2px 8px',
  } as const

  return (
    <div className="mt-2 mb-4">
      <div
        className="rounded-lg bg-white"
        style={{
          border: '1px solid #1B3A5C',
          borderRadius: '8px',
          padding: '14px 16px',
        }}
      >
        <div className="mb-2 flex items-center gap-1.5">
          <IconCheck size={16} color="#2E8B57" stroke={2} />
          <span
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {labels.ai_template_ready_heading}
          </span>
        </div>

        <p
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: colors.brand_navy,
          }}
        >
          {template.name}
        </p>

        {template.description ? (
          <p
            className="mt-1"
            style={{ fontSize: '12px', color: colors.text_muted }}
          >
            {template.description}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-1.5">
          {eventTypeLabel ? (
            <span style={tagPillStyle}>{eventTypeLabel}</span>
          ) : null}
          {serviceStyleLabel ? (
            <span style={tagPillStyle}>{serviceStyleLabel}</span>
          ) : null}
          <span style={tagPillStyle}>
            Up to {template.guest_count_default} guests
          </span>
          <span style={tagPillStyle}>{template.total_staff_needed} staff</span>
        </div>

        {template.venue_name ? (
          <p
            className="mt-2"
            style={{
              fontSize: '12px',
              color: colors.text_muted,
              fontStyle: 'italic',
            }}
          >
            {template.venue_name}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={saved || saving}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-70"
          style={{ backgroundColor: colors.brand_navy }}
        >
          {saved ? (
            <>
              <IconCheck size={16} stroke={2} />
              {labels.ai_template_saved_confirmation}
            </>
          ) : (
            labels.ai_template_save_button
          )}
        </button>

        <button
          type="button"
          onClick={onUseNow}
          disabled={saving}
          className="w-full rounded-lg py-3 text-sm font-semibold text-white disabled:opacity-70"
          style={{ backgroundColor: colors.brand_red }}
        >
          {labels.ai_template_use_now_button}
        </button>

        <button
          type="button"
          onClick={onStartOver}
          className="mt-1 text-center text-sm hover:underline"
          style={{ color: colors.text_muted }}
        >
          {labels.ai_template_start_over}
        </button>
      </div>
    </div>
  )
}

export default function AITemplateBuilderOverlay() {
  const { labels, colors, event_types, service_styles } = useProductConfig()
  const { openOverlay } = useOverlay()

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [mode, setMode] = useState<BuilderMode>('select')
  const [messages, setMessages] = useState<ChatMessage[]>(createOpeningMessages)
  const [apiMessages, setApiMessages] = useState<AnthropicChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [apiError, setApiError] = useState(false)
  const [parsedTemplate, setParsedTemplate] = useState<AIGeneratedTemplate | null>(
    null,
  )
  const [savedTemplateId, setSavedTemplateId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const threadRef = useRef<HTMLDivElement>(null)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const pendingRetryRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOrg() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (cancelled || error) {
        return
      }

      const orgId = user?.user_metadata?.organization_id
      if (typeof orgId === 'string' && orgId.trim().length > 0) {
        setOrganizationId(orgId.trim())
      }
    }

    void loadOrg()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, parsedTemplate, apiError])

  const appendAssistantMessage = useCallback((content: string) => {
    setMessages((previous) => [
      ...previous,
      { id: createMessageId(), role: 'assistant', content },
    ])
  }, [])

  const sendToApi = useCallback(
    async (history: AnthropicChatMessage[]) => {
      setIsLoading(true)
      setApiError(false)

      const run = async () => {
        try {
          const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
          if (!apiKey) {
            throw new Error('Missing VITE_ANTHROPIC_API_KEY')
          }

          const response = await fetch(ANTHROPIC_API_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 1000,
              system: AI_TEMPLATE_BUILDER_SYSTEM_PROMPT,
              messages: history,
            }),
          })

          if (!response.ok) {
            const errorBody = await response.text()
            throw new Error(errorBody || `Anthropic API error: ${response.status}`)
          }

          const payload = (await response.json()) as {
            content?: Array<{ type: string; text?: string }>
          }

          const textBlock = payload.content?.find(
            (block) => block.type === 'text' && typeof block.text === 'string',
          )

          if (!textBlock?.text) {
            throw new Error('No text content in Anthropic response')
          }

          const rawResponse = textBlock.text
          const { displayText, template } = parseTemplateBuilderResponse(rawResponse)

          appendAssistantMessage(displayText)
          setApiMessages((previous) => [
            ...previous,
            { role: 'assistant', content: rawResponse },
          ])

          if (template) {
            setParsedTemplate(template)
          }
        } catch (error) {
          console.error('AI Template Builder API failed:', error)
          setApiError(true)
          pendingRetryRef.current = run
        } finally {
          setIsLoading(false)
        }
      }

      pendingRetryRef.current = run
      await run()
    },
    [appendAssistantMessage],
  )

  const handleSelectMode = (selectedMode: 'freeform' | 'guided') => {
    setMode(selectedMode)
    setParsedTemplate(null)
    setSaved(false)
    setSavedTemplateId(null)
    setApiError(false)

    setMessages((previous) =>
      previous.map((message) =>
        message.showModeButtons ? { ...message, showModeButtons: false } : message,
      ),
    )

    const userText =
      selectedMode === 'freeform' ? "I'll describe it myself." : 'Ask me questions.'

    setMessages((previous) => [
      ...previous,
      { id: createMessageId(), role: 'user', content: userText },
    ])

    if (selectedMode === 'freeform') {
      appendAssistantMessage(FREEFORM_FOLLOWUP)
      setApiMessages([
        { role: 'user', content: userText },
        { role: 'assistant', content: FREEFORM_FOLLOWUP },
      ])
      return
    }

    appendAssistantMessage(GUIDED_FIRST_QUESTION)
    setApiMessages([
      { role: 'user', content: userText },
      { role: 'assistant', content: GUIDED_FIRST_QUESTION },
    ])
  }

  const handleSend = async () => {
    const trimmed = inputValue.trim()
    if (!trimmed || isLoading || parsedTemplate) {
      return
    }

    setInputValue('')
    setApiError(false)

    setMessages((previous) => [
      ...previous,
      { id: createMessageId(), role: 'user', content: trimmed },
    ])

    const nextHistory: AnthropicChatMessage[] = [
      ...apiMessages,
      { role: 'user', content: trimmed },
    ]
    setApiMessages(nextHistory)
    await sendToApi(nextHistory)
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void handleSend()
    }
  }

  const handleStartOver = () => {
    setMode('select')
    setMessages(createOpeningMessages())
    setApiMessages([])
    setInputValue('')
    setParsedTemplate(null)
    setSaved(false)
    setSavedTemplateId(null)
    setApiError(false)
    setIsLoading(false)
    pendingRetryRef.current = null
  }

  const ensureSaved = async (): Promise<string | null> => {
    if (!organizationId || !parsedTemplate) {
      return null
    }

    if (savedTemplateId) {
      return savedTemplateId
    }

    setSaving(true)
    const { data, error } = await insertAiGeneratedTemplate(
      organizationId,
      parsedTemplate,
    )
    setSaving(false)

    if (error || !data) {
      console.error('Failed to save AI template:', error)
      return null
    }

    setSavedTemplateId(data.id)
    setSaved(true)
    return data.id
  }

  const handleSave = async () => {
    await ensureSaved()
  }

  const handleUseNow = async () => {
    if (!organizationId || !parsedTemplate) {
      return
    }

    setSaving(true)

    let eventTemplate: EventTemplate | null = null

    if (savedTemplateId) {
      const { data } = await supabase
        .from('event_templates')
        .select(EVENT_TEMPLATE_SELECT)
        .eq('id', savedTemplateId)
        .single()
      eventTemplate = (data as EventTemplate | null) ?? null
    } else {
      const { data, error } = await insertAiGeneratedTemplate(
        organizationId,
        parsedTemplate,
      )
      if (error || !data) {
        console.error('Failed to save AI template before use:', error)
        setSaving(false)
        return
      }
      eventTemplate = data
      setSavedTemplateId(data.id)
      setSaved(true)
    }

    setSaving(false)

    if (!eventTemplate) {
      return
    }

    openOverlay('new-event', {
      mode: 'manual',
      initialTemplate: aiTemplateToEventTemplate(
        organizationId,
        parsedTemplate,
        eventTemplate,
      ),
    })
  }

  const handleRetry = () => {
    if (pendingRetryRef.current) {
      void pendingRetryRef.current()
    }
  }

  const showInput = mode === 'freeform' || mode === 'guided'

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{
        backgroundColor: colors.brand_light_blue,
        height: 'calc(100dvh - 3rem)',
      }}
    >
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <IconSparkles size={18} color={colors.brand_navy} stroke={2} />
          <p style={{ fontSize: '13px', color: colors.text_muted }}>
            {labels.ai_template_builder_subtitle}
          </p>
        </div>
      </div>

      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto px-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`mb-3 flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' ? (
              <div className="flex max-w-[85%] items-start gap-2">
                <div
                  className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: '#1B3A5C' }}
                >
                  GM
                </div>
                <div className="min-w-0">
                  <div
                    className="rounded-lg border bg-white whitespace-pre-wrap"
                    style={{
                      borderColor: '#E5E7EB',
                      borderRadius: '8px',
                      padding: '12px 14px',
                      fontSize: '14px',
                      color: colors.brand_navy,
                    }}
                  >
                    {message.content}
                  </div>
                  {message.showModeButtons ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectMode('freeform')}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          color: colors.brand_navy,
                          borderColor: colors.brand_navy,
                          backgroundColor: colors.white,
                        }}
                      >
                        {labels.ai_template_mode_freeform}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectMode('guided')}
                        className="rounded-lg border px-3 py-1.5 text-xs font-semibold"
                        style={{
                          color: colors.brand_navy,
                          borderColor: colors.brand_navy,
                          backgroundColor: colors.white,
                        }}
                      >
                        {labels.ai_template_mode_guided}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div
                className="max-w-[85%] rounded-lg whitespace-pre-wrap text-white"
                style={{
                  backgroundColor: colors.brand_navy,
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '14px',
                }}
              >
                {message.content}
              </div>
            )}
          </div>
        ))}

        {isLoading ? <TypingIndicator /> : null}

        {apiError ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-sm text-red-600">{labels.ai_template_api_error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-1 text-sm font-semibold text-red-700 hover:underline"
            >
              {labels.ai_template_retry}
            </button>
          </div>
        ) : null}

        {parsedTemplate ? (
          <TemplatePreviewCard
            template={parsedTemplate}
            saved={saved}
            saving={saving}
            onSave={() => void handleSave()}
            onUseNow={() => void handleUseNow()}
            onStartOver={handleStartOver}
            labels={labels}
            colors={colors}
            event_types={event_types}
            service_styles={service_styles}
          />
        ) : null}

        <div ref={threadEndRef} />
      </div>

      {showInput && !parsedTemplate ? (
        <div
          className="shrink-0 border-t bg-white px-4 py-3"
          style={{ borderColor: '#E5E7EB' }}
        >
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              void handleSend()
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleInputKeyDown}
              disabled={isLoading}
              placeholder={labels.ai_template_input_placeholder}
              rows={2}
              className="min-h-[44px] flex-1 resize-none rounded-md border px-3 py-2.5 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none"
              style={{
                borderColor: '#E5E7EB',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-md text-white disabled:opacity-60"
              style={{ backgroundColor: colors.brand_navy }}
            >
              <IconSend size={18} stroke={2} />
            </button>
          </form>
        </div>
      ) : null}
    </div>
  )
}
