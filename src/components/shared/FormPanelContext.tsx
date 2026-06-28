import { createContext, useContext } from 'react'

interface FormPanelContextValue {
  minimize: () => void
}

export const FormPanelContext = createContext<FormPanelContextValue | null>(
  null,
)

export function useFormPanel(): FormPanelContextValue | null {
  return useContext(FormPanelContext)
}
