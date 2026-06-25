import { useEffect, useState } from 'react'
import { BrowserRouter } from 'react-router-dom'
import AppShell from './components/shared/AppShell'
import SMSDeepLinkHandler from './components/shared/SMSDeepLinkHandler'
import cateringConfig from './lib/productConfig'
import {
  ProductConfigProvider,
  useProductConfig,
} from './lib/hooks/useProductConfig'
import { supabase } from './lib/supabase'
import LoginPage from './pages/auth/LoginPage'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

function AppContent() {
  const { labels } = useProductConfig()
  const [authState, setAuthState] = useState<AuthState>('loading')

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
    <div className="flex min-h-[calc(100vh-3rem)] flex-1 items-center justify-center">
      <p className="text-text-body">
        {labels.command_center} — {labels.coming_soon}
      </p>
    </div>
  )
}

function App() {
  return (
    <ProductConfigProvider value={cateringConfig}>
      <BrowserRouter>
        <AppShell>
          <SMSDeepLinkHandler />
          <AppContent />
        </AppShell>
      </BrowserRouter>
    </ProductConfigProvider>
  )
}

export default App
