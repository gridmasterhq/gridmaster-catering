import { BrowserRouter } from 'react-router-dom'
import AppShell from './components/shared/AppShell'
import SMSDeepLinkHandler from './components/shared/SMSDeepLinkHandler'
import cateringConfig from './lib/productConfig'
import { ProductConfigProvider } from './lib/hooks/useProductConfig'
import LoginPage from './pages/auth/LoginPage'

function App() {
  return (
    <ProductConfigProvider value={cateringConfig}>
      <BrowserRouter>
        <AppShell>
          <SMSDeepLinkHandler />
          <LoginPage />
        </AppShell>
      </BrowserRouter>
    </ProductConfigProvider>
  )
}

export default App
