import { useEffect, useState } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AppShell, { useActiveScreen } from './components/shared/AppShell'
import SMSDeepLinkHandler from './components/shared/SMSDeepLinkHandler'
import cateringConfig from './lib/productConfig'
import { ProductConfigProvider } from './lib/hooks/useProductConfig'
import { supabase } from './lib/supabase'
import LoginPage from './pages/auth/LoginPage'
import CalendarPage from './pages/catering/CalendarPage'
import CommandCenterPage from './pages/catering/CommandCenterPage'
import NewEvent from './pages/NewEvent'
import EventGridPage from './pages/EventGridPage'
import CaptainRatePage from './pages/captain/CaptainRatePage'
import MobileCommandCenterPage from './pages/coordinator/MobileCommandCenterPage'
import SOSPage from './pages/coordinator/SOSPage'
import StaffCheckInPage from './pages/staff/StaffCheckInPage'
import StaffCheckoutPage from './pages/staff/StaffCheckoutPage'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

function CoordinatorApp() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const { activeScreen } = useActiveScreen()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState(session ? 'authenticated' : 'unauthenticated')
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState(session ? 'authenticated' : 'unauthenticated')
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  if (authState === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] flex-1 items-center justify-center bg-brand-light-blue">
        <div
          className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  if (authState === 'unauthenticated') {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route path="/new-event" element={<NewEvent />} />
      <Route
        path="*"
        element={
          activeScreen === 'cc' ? <CommandCenterPage /> : <CalendarPage />
        }
      />
    </Routes>
  )
}

function App() {
  return (
    <ProductConfigProvider value={cateringConfig}>
      <BrowserRouter>
        <Routes>
          <Route path="/staff/checkin" element={<StaffCheckInPage />} />
          <Route path="/staff/checkout" element={<StaffCheckoutPage />} />
          <Route
            path="/mobile/command-center"
            element={<MobileCommandCenterPage />}
          />
          <Route path="/captain/rate" element={<CaptainRatePage />} />
          <Route path="/sos" element={<SOSPage />} />
          <Route path="/event/:eventId" element={<EventGridPage />} />
          <Route
            path="*"
            element={
              <AppShell>
                <SMSDeepLinkHandler />
                <CoordinatorApp />
              </AppShell>
            }
          />
        </Routes>
      </BrowserRouter>
    </ProductConfigProvider>
  )
}

export default App
