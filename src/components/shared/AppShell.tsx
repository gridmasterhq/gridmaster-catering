import { useCallback, useEffect, useRef, useState, createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

type ActiveScreen = 'cc' | 'calendar'

interface ActiveScreenContextValue {
  activeScreen: ActiveScreen
  setActiveScreen: (screen: ActiveScreen) => void
}

const ActiveScreenContext = createContext<ActiveScreenContextValue | null>(null)

export function useActiveScreen(): ActiveScreenContextValue {
  const context = useContext(ActiveScreenContext)

  if (!context) {
    throw new Error('useActiveScreen must be used within AppShell')
  }

  return context
}

function emailPrefix(email: string): string {
  const atIndex = email.indexOf('@')
  return atIndex > 0 ? email.slice(0, atIndex) : email
}

function metadataDisplayName(user: {
  user_metadata?: Record<string, unknown>
}): string | null {
  const metadata = user.user_metadata ?? {}
  const fullName = metadata.full_name
  const name = metadata.name
  const displayName = metadata.display_name

  if (typeof fullName === 'string' && fullName.trim()) {
    return fullName.trim()
  }
  if (typeof name === 'string' && name.trim()) {
    return name.trim()
  }
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim()
  }
  return null
}

async function resolveUserDisplayName(user: {
  email?: string
  user_metadata?: Record<string, unknown>
}): Promise<string> {
  if (user.email) {
    const { data } = await supabase
      .from('users')
      .select('full_name, display_name')
      .eq('email', user.email)
      .single()

    if (typeof data?.display_name === 'string' && data.display_name.trim()) {
      return data.display_name.trim()
    }
    if (typeof data?.full_name === 'string' && data.full_name.trim()) {
      return data.full_name.trim()
    }
  }

  const fromMetadata = metadataDisplayName(user)
  if (fromMetadata) {
    return fromMetadata
  }

  if (user.email) {
    return emailPrefix(user.email)
  }

  return ''
}

interface AppShellProps {
  children: ReactNode
}

function AppShell({ children }: AppShellProps) {
  const { brand_name, product_name, navigation, labels, colors } =
    useProductConfig()

  const [leftSidebarOpen, setLeftSidebarOpen] = useState(false)
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false)
  const [showFooter, setShowFooter] = useState(false)
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('calendar')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [userDisplayName, setUserDisplayName] = useState('')
  const accountMenuRef = useRef<HTMLDivElement>(null)

  const hqIndex = brand_name.lastIndexOf(' ')
  const gridMasterWordmark =
    hqIndex === -1 ? brand_name : brand_name.slice(0, hqIndex)
  const hqWordmark = hqIndex === -1 ? '' : brand_name.slice(hqIndex + 1)

  const themeVars = {
    '--shell-brand-navy': colors.brand_navy,
    '--shell-brand-red': colors.brand_red,
    '--shell-text-body': colors.text_body,
  } as CSSProperties

  const openLeftSidebar = useCallback(() => {
    setRightSidebarOpen(false)
    setLeftSidebarOpen(true)
  }, [])

  const openRightSidebar = useCallback(() => {
    setLeftSidebarOpen(false)
    setRightSidebarOpen(true)
  }, [])

  const closeSidebars = useCallback(() => {
    setLeftSidebarOpen(false)
    setRightSidebarOpen(false)
  }, [])

  useEffect(() => {
    async function loadUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserDisplayName(await resolveUserDisplayName(user))
      }
    }

    loadUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUserDisplayName(await resolveUserDisplayName(session.user))
      } else {
        setUserDisplayName('')
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!accountMenuOpen) {
      return
    }

    function handleClickOutside(event: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [accountMenuOpen])

  const handleLogOut = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.reload()
  }, [])

  const screenLabelStyle = useCallback(
    (screen: ActiveScreen): CSSProperties => {
      const isActive = activeScreen === screen

      return {
        cursor: 'pointer',
        fontWeight: isActive ? 600 : 400,
        opacity: isActive ? 1 : 0.65,
        ...(isActive
          ? { borderBottom: '2px solid white', paddingBottom: '2px' }
          : {}),
      }
    },
    [activeScreen],
  )

  useEffect(() => {
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } =
        document.documentElement
      const atBottom = scrollTop + clientHeight >= scrollHeight - 8
      setShowFooter(atBottom)
    }

    handleScroll()
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [])

  const sidebarOpen = leftSidebarOpen || rightSidebarOpen

  return (
    <ActiveScreenContext.Provider value={{ activeScreen, setActiveScreen }}>
    <div className="min-h-screen flex flex-col" style={themeVars}>
      <header className="fixed top-0 left-0 right-0 z-30 flex h-12 w-full">
        <section className="flex flex-1 items-center gap-10 bg-[var(--shell-brand-red)] px-16">
          <button
            type="button"
            className="text-lg text-white cursor-pointer"
            aria-label={labels.command_center}
            onClick={openLeftSidebar}
          >
            ☰
          </button>
          <button
            type="button"
            className="text-sm tracking-wide text-white uppercase"
            style={screenLabelStyle('cc')}
            onClick={() => setActiveScreen('cc')}
          >
            {labels.command_center}
          </button>
        </section>

        <section className="relative flex shrink-0 flex-row items-center gap-3 border-l-2 border-r-2 border-l-brand-navy border-r-brand-red bg-white px-4 py-1">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex h-0.5"
            aria-hidden="true"
          >
            <div className="h-full w-1/2 bg-brand-navy" />
            <div className="h-full w-1/2 bg-brand-red" />
          </div>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 flex h-0.5"
            aria-hidden="true"
          >
            <div className="h-full w-1/2 bg-brand-navy" />
            <div className="h-full w-1/2 bg-brand-red" />
          </div>
          <div className="flex flex-col items-center leading-tight whitespace-nowrap">
            <div>
              <span
                className="font-bold text-[var(--shell-brand-navy)]"
                style={{ fontSize: '17px' }}
              >
                {gridMasterWordmark}
              </span>{' '}
              {hqWordmark ? (
                <span
                  className="font-bold text-[var(--shell-brand-red)]"
                  style={{ fontSize: '17px' }}
                >
                  {hqWordmark}
                </span>
              ) : null}
            </div>
            <span
              className="italic font-['Playfair_Display',serif] text-[var(--shell-text-body)]"
              style={{ fontSize: '10px' }}
            >
              {product_name}
            </span>
          </div>

          <div
            ref={accountMenuRef}
            className="relative shrink-0"
            style={{ minWidth: '110px' }}
          >
            <button
              type="button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              style={{
                backgroundColor: '#ffffff',
                border: '1.5px solid #1B3A5C',
                borderRadius: '6px',
                padding: '4px 10px',
                minWidth: '110px',
                flexShrink: 0,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: '#C0392B',
                  fontSize: '13px',
                  fontWeight: 600,
                  lineHeight: 1.2,
                }}
              >
                {userDisplayName}
              </div>
              <div
                style={{
                  color: '#1B3A5C',
                  fontSize: '10px',
                  fontWeight: 400,
                  lineHeight: 1.2,
                }}
              >
                {labels.account_user}
              </div>
            </button>

            {accountMenuOpen ? (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '100%',
                  zIndex: 200,
                  minWidth: '140px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                }}
              >
                {[labels.my_profile, labels.event_mode, labels.sleep_mode].map(
                  (itemLabel) => (
                    <button
                      key={itemLabel}
                      type="button"
                      className="block w-full text-left hover:bg-gray-50"
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        color: '#374151',
                        cursor: 'pointer',
                      }}
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      {itemLabel}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  className="block w-full text-left hover:bg-gray-50"
                  style={{
                    padding: '8px 12px',
                    fontSize: '12px',
                    color: '#374151',
                    cursor: 'pointer',
                  }}
                  onClick={handleLogOut}
                >
                  {labels.log_out}
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section className="flex flex-1 items-center justify-end gap-10 bg-[var(--shell-brand-navy)] px-16">
          <button
            type="button"
            className="text-sm tracking-wide text-white uppercase"
            style={screenLabelStyle('calendar')}
            onClick={() => setActiveScreen('calendar')}
          >
            {labels.calendar}
          </button>
          <button
            type="button"
            className="text-lg text-white cursor-pointer"
            aria-label={labels.calendar}
            onClick={openRightSidebar}
          >
            ☰
          </button>
        </section>
      </header>

      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 cursor-default bg-black/40"
          aria-label="Close menu"
          onClick={closeSidebars}
        />
      ) : null}

      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-72 flex-col gap-1 bg-[var(--shell-brand-red)] p-4 pt-16 transition-transform duration-300 ${
          leftSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!leftSidebarOpen}
      >
        {navigation.red.map((item) => (
          <button
            key={item.id}
            type="button"
            className="rounded px-2 py-2 text-left text-sm text-white cursor-pointer hover:bg-white/10"
            onClick={closeSidebars}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-72 flex-col gap-1 bg-[var(--shell-brand-navy)] p-4 pt-16 transition-transform duration-300 ${
          rightSidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!rightSidebarOpen}
      >
        {navigation.blue.map((item) => (
          <button
            key={item.id}
            type="button"
            className="rounded px-2 py-2 text-left text-sm text-white cursor-pointer hover:bg-white/10"
            onClick={closeSidebars}
          >
            {item.label}
          </button>
        ))}
      </aside>

      <div className="flex min-h-screen flex-col pt-12">
        <main className="flex-1">{children}</main>

        <footer
          className={`border-t border-gray-200 px-6 py-4 text-center text-sm text-[var(--shell-text-body)] transition-opacity ${
            showFooter ? 'opacity-100' : 'pointer-events-none h-0 overflow-hidden opacity-0'
          }`}
        >
          <a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {labels.footer_ask_ai}
          </a>
          <span className="mx-3">·</span>
          <a
            href="#"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
          >
            {labels.footer_community}
          </a>
        </footer>
      </div>
    </div>
    </ActiveScreenContext.Provider>
  )
}

export default AppShell
