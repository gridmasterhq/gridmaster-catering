import cateringConfig from './lib/productConfig'
import {
  ProductConfigProvider,
  useProductConfig,
} from './lib/hooks/useProductConfig'

function AppContent() {
  const { brand_name } = useProductConfig()

  return <div>{brand_name}</div>
}

function App() {
  return (
    <ProductConfigProvider value={cateringConfig}>
      <AppContent />
    </ProductConfigProvider>
  )
}

export default App
