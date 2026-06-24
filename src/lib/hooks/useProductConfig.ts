import { createContext, createElement, useContext, type ReactNode } from 'react'
import type { ProductConfig } from '../productConfig'

const ProductConfigContext = createContext<ProductConfig | null>(null)

interface ProductConfigProviderProps {
  value: ProductConfig
  children: ReactNode
}

export function ProductConfigProvider({
  value,
  children,
}: ProductConfigProviderProps) {
  return createElement(ProductConfigContext.Provider, { value }, children)
}

export function useProductConfig(): ProductConfig {
  const context = useContext(ProductConfigContext)

  if (!context) {
    throw new Error('useProductConfig must be used within a ProductConfigProvider')
  }

  return context
}
