import AppShell from './components/shared/AppShell'
import cateringConfig from './lib/productConfig'
import { ProductConfigProvider } from './lib/hooks/useProductConfig'
import LoginPage from './pages/auth/LoginPage'

function App() {
  return (
    <ProductConfigProvider value={cateringConfig}>
      <AppShell>
        <LoginPage />
      </AppShell>
    </ProductConfigProvider>
  )
}

export default App
