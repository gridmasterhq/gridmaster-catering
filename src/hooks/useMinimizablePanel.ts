import { useCallback, useEffect, useRef, useState } from 'react'
import { useTabManager } from '../components/TabManager'

interface UseMinimizablePanelOptions {
  id: string
  label: string
  color: string
  enabled?: boolean
  onRestore?: () => void
}

export function useMinimizablePanel({
  id,
  label,
  color,
  enabled = true,
  onRestore,
}: UseMinimizablePanelOptions) {
  const { registerTab, unregisterTab, canOpenNew, showMaxTabsNotice } =
    useTabManager()
  const [isMinimized, setIsMinimized] = useState(false)
  const onRestoreRef = useRef(onRestore)

  onRestoreRef.current = onRestore

  const restore = useCallback(() => {
    if (!enabled) {
      return
    }

    unregisterTab(id)
    setIsMinimized(false)
    onRestoreRef.current?.()
  }, [enabled, id, unregisterTab])

  const minimize = useCallback(() => {
    if (!enabled) {
      return
    }

    registerTab(id, label, color, restore)
    setIsMinimized(true)
  }, [color, enabled, id, label, registerTab, restore])

  const canOpen = useCallback(() => {
    if (!enabled) {
      return true
    }

    if (canOpenNew()) {
      return true
    }

    showMaxTabsNotice()
    return false
  }, [canOpenNew, enabled, showMaxTabsNotice])

  useEffect(() => {
    if (!enabled) {
      return
    }

    return () => {
      unregisterTab(id)
    }
  }, [enabled, id, unregisterTab])

  return {
    isMinimized: enabled ? isMinimized : false,
    minimize,
    restore,
    canOpen,
  }
}
