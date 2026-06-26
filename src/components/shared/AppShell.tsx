import { useCallback, useEffect, useRef, useState, createContext, useContext, type CSSProperties, type ReactNode } from 'react'
import {
  IconBell,
  IconBolt,
  IconBriefcase,
  IconBuilding,
  IconBuildingStore,
  IconCash,
  IconChartBar,
  IconCopy,
  IconCpu,
  IconGift,
  IconHelpCircle,
  IconLayoutGrid,
  IconMapPin,
  IconPlug,
  IconPlus,
  IconReceipt,
  IconSchool,
  IconSettings,
  IconSparkles,
  IconTruck,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import type { NavItem } from '../../lib/productConfig'
import {
  ExpertModeProvider,
  useExpertMode,
  type ExpertModeScreen,
} from './ExpertModeToggle'

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

const sidebarStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '220px',
  height: '100%',
  backgroundColor: '#ffffff',
  borderRight: '0.5px solid #e5e7eb',
  overflowY: 'auto',
  zIndex: 201,
  transition: 'transform 0.2s ease',
}

const sectionLabelStyle: CSSProperties = {
  fontSize: '10px',
  fontWeight: 500,
  color: '#9ca3af',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  marginBottom: '4px',
  padding: '10px 12px 0',
}

const ccIconMap: Record<string, Icon> = {
  ai_mode: IconCpu,
  agency: IconBuildingStore,
  competing_events: IconMapPin,
  transport: IconTruck,
  pay_rates: IconCash,
  user_management: IconUsers,
  notifications: IconBell,
  integrations: IconPlug,
  billing: IconReceipt,
  settings: IconSettings,
  expert_mode: IconBolt,
  help: IconHelpCircle,
}

const calendarIconMap: Record<string, Icon> = {
  new_event: IconPlus,
  event_settings: IconSettings,
  my_templates: IconCopy,
  gridmaster_templates: IconLayoutGrid,
  ai_template_builder: IconSparkles,
  staff: IconUsers,
  clients: IconBuilding,
  roles: IconBriefcase,
  training: IconSchool,
  reports: IconChartBar,
  incentives: IconGift,
  expert_mode: IconBolt,
  help: IconHelpCircle,
}

const ccSidebarSections = [
  {
    labelKey: 'nav_section_operations' as const,
    itemIds: [
      'ai_mode',
      'agency',
      'competing_events',
      'transport',
      'pay_rates',
    ],
  },
  {
    labelKey: 'nav_section_account' as const,
    itemIds: [
      'user_management',
      'notifications',
      'integrations',
      'billing',
      'settings',
    ],
  },
  {
    labelKey: 'nav_section_preferences' as const,
    itemIds: ['expert_mode', 'help'],
  },
] as const

const calendarSidebarSections = [
  {
    labelKey: 'nav_section_events' as const,
    itemIds: ['new_event', 'event_settings'],
  },
  {
    labelKey: 'nav_section_templates' as const,
    itemIds: ['my_templates', 'gridmaster_templates', 'ai_template_builder'],
  },
  {
    labelKey: 'nav_section_people' as const,
    itemIds: ['staff', 'clients', 'roles'],
  },
  {
    labelKey: 'nav_section_development' as const,
    itemIds: ['training'],
  },
  {
    labelKey: 'nav_section_more' as const,
    itemIds: ['reports', 'incentives', 'expert_mode', 'help'],
  },
] as const

interface SidebarItemProps {
  icon: Icon
  label: string
  subtext?: string
  hideSubtext?: boolean
  onClick: () => void
}

function SidebarItem({
  icon: ItemIcon,
  label,
  subtext,
  hideSubtext = false,
  onClick,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center hover:bg-[#f3f4f6]"
      style={{
        gap: '8px',
        padding: '7px 8px',
        borderRadius: '6px',
        fontSize: '12px',
        color: '#111827',
        cursor: 'pointer',
        marginBottom: '1px',
        marginLeft: '12px',
        marginRight: '12px',
        width: 'calc(100% - 24px)',
      }}
      onClick={onClick}
    >
      <ItemIcon size={16} color="#1B3A5C" style={{ flexShrink: 0 }} />
      <span className="flex min-w-0 flex-1 flex-col items-start text-left">
        <span>{label}</span>
        {subtext && !hideSubtext ? (
          <span style={{ fontSize: '10px', color: '#9ca3af', lineHeight: 1.3 }}>
            {subtext}
          </span>
        ) : null}
      </span>
    </button>
  )
}

interface SidebarExpertBoltProps {
  onClick: () => void
}

function SidebarExpertBolt({ onClick }: SidebarExpertBoltProps) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-center hover:bg-[#f3f4f6]"
      style={{
        padding: '7px 8px',
        borderRadius: '6px',
        cursor: 'pointer',
        marginBottom: '1px',
        marginLeft: '12px',
        marginRight: '12px',
        width: 'calc(100% - 24px)',
      }}
      onClick={onClick}
      aria-label="Exit Expert Mode"
    >
      <IconBolt size={16} color="#1B3A5C" stroke={2} />
    </button>
  )
}

interface AppSidebarProps {
  open: boolean
  title: string
  headerBackground: string
  headerBorderBottom: string
  onClose: () => void
  children: ReactNode
}

function AppSidebar({
  open,
  title,
  headerBackground,
  headerBorderBottom,
  onClose,
  children,
}: AppSidebarProps) {
  return (
    <aside
      style={{
        ...sidebarStyle,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
      }}
      aria-hidden={!open}
    >
      <div
        style={{
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: headerBorderBottom,
          position: 'sticky',
          top: 0,
          zIndex: 1,
          backgroundColor: headerBackground,
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 500, color: '#ffffff' }}>
          {title}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#ffffff',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            padding: 0,
          }}
          aria-label="Close menu"
        >
          <IconX size={18} />
        </button>
      </div>
      {children}
    </aside>
  )
}

interface SidebarSectionProps {
  label: string
  showDivider?: boolean
  children: ReactNode
}

function SidebarSection({
  label,
  showDivider = false,
  children,
}: SidebarSectionProps) {
  return (
    <>
      {showDivider ? (
        <div
          style={{
            height: '0.5px',
            backgroundColor: '#e5e7eb',
            margin: '8px 12px',
          }}
          aria-hidden="true"
        />
      ) : null}
      <div style={sectionLabelStyle}>{label}</div>
      {children}
    </>
  )
}

function resolveNavLabel(
  itemId: string,
  items: NavItem[],
  trainingLabel: string,
): string {
  if (itemId === 'training') {
    return trainingLabel
  }

  return items.find((item) => item.id === itemId)?.label ?? ''
}

function resolveNavSubtext(itemId: string, items: NavItem[]): string | undefined {
  return items.find((item) => item.id === itemId)?.subtext
}

interface SidebarNavItemsProps {
  screen: ExpertModeScreen
  itemIds: readonly string[]
  iconMap: Record<string, Icon>
  navItems: NavItem[]
  trainingLabel: string
  onClose: () => void
}

function SidebarNavItems({
  screen,
  itemIds,
  iconMap,
  navItems,
  trainingLabel,
  onClose,
}: SidebarNavItemsProps) {
  const { isExpert, setExpertMode } = useExpertMode(screen)

  return (
    <>
      {itemIds.map((itemId) => {
        if (itemId === 'expert_mode' && isExpert) {
          return (
            <SidebarExpertBolt
              key={itemId}
              onClick={() => setExpertMode(false)}
            />
          )
        }

        const ItemIcon = iconMap[itemId]
        const label = resolveNavLabel(itemId, navItems, trainingLabel)
        const subtext = resolveNavSubtext(itemId, navItems)

        return (
          <SidebarItem
            key={itemId}
            icon={ItemIcon}
            label={label}
            subtext={subtext}
            hideSubtext={isExpert}
            onClick={() => {
              if (itemId === 'expert_mode') {
                setExpertMode(true)
                return
              }
              onClose()
            }}
          />
        )
      })}
    </>
  )
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
    <ExpertModeProvider>
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
                className="text-[var(--shell-brand-navy)]"
                style={{ fontSize: '15px', fontWeight: 500 }}
              >
                {gridMasterWordmark}
              </span>{' '}
              {hqWordmark ? (
                <span
                  className="text-[var(--shell-brand-red)]"
                  style={{ fontSize: '15px', fontWeight: 500 }}
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
                  fontSize: '14px',
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
          aria-label="Close menu"
          onClick={closeSidebars}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 200,
            border: 'none',
            cursor: 'default',
          }}
        />
      ) : null}

      <AppSidebar
        open={leftSidebarOpen}
        title={labels.command_center}
        headerBackground="#C0392B"
        headerBorderBottom="0.5px solid rgba(255, 255, 255, 0.2)"
        onClose={closeSidebars}
      >
        {ccSidebarSections.map((section, sectionIndex) => (
          <SidebarSection
            key={section.labelKey}
            label={labels[section.labelKey]}
            showDivider={sectionIndex > 0}
          >
            <SidebarNavItems
              screen="cc"
              itemIds={section.itemIds}
              iconMap={ccIconMap}
              navItems={navigation.red}
              trainingLabel={labels.training}
              onClose={closeSidebars}
            />
          </SidebarSection>
        ))}
      </AppSidebar>

      <AppSidebar
        open={rightSidebarOpen}
        title={labels.calendar}
        headerBackground="#1B3A5C"
        headerBorderBottom="0.5px solid rgba(255, 255, 255, 0.2)"
        onClose={closeSidebars}
      >
        {calendarSidebarSections.map((section, sectionIndex) => (
          <SidebarSection
            key={section.labelKey}
            label={labels[section.labelKey]}
            showDivider={sectionIndex > 0}
          >
            <SidebarNavItems
              screen="cal"
              itemIds={section.itemIds}
              iconMap={calendarIconMap}
              navItems={navigation.blue}
              trainingLabel={labels.training}
              onClose={closeSidebars}
            />
          </SidebarSection>
        ))}
      </AppSidebar>

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
    </ExpertModeProvider>
  )
}

export default AppShell
