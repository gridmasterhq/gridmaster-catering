import AppShell from './components/shared/AppShell'
import cateringConfig from './lib/productConfig'
import {
  ProductConfigProvider,
  useProductConfig,
} from './lib/hooks/useProductConfig'

function AppContent() {
  const { brand_name } = useProductConfig()

  return (
    <AppShell>
      <div>{brand_name}</div>
    </AppShell>
  )
}

function App() {
  return (
    <ProductConfigProvider value={cateringConfig}>
      <AppContent />
    </ProductConfigProvider>
  )
}

export default App
