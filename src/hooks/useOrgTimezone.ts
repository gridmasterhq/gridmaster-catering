import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const DEFAULT_TIMEZONE = 'America/New_York'

export function useOrgTimezone() {
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const refetch = useCallback(() => {
    setRefreshKey((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadOrgTimezone() {
      setLoading(true)

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (cancelled) {
        return
      }

      if (userError || !user) {
        setLoading(false)
        return
      }

      const orgId = user.user_metadata?.organization_id
      if (typeof orgId !== 'string' || orgId.trim().length === 0) {
        setLoading(false)
        return
      }

      const trimmedOrgId = orgId.trim()
      setOrganizationId(trimmedOrgId)

      const { data, error } = await supabase
        .from('organizations')
        .select('timezone')
        .eq('id', trimmedOrgId)
        .maybeSingle()

      if (cancelled) {
        return
      }

      if (!error && typeof data?.timezone === 'string' && data.timezone.trim()) {
        setTimezone(data.timezone.trim())
      } else {
        setTimezone(DEFAULT_TIMEZONE)
      }

      setLoading(false)
    }

    void loadOrgTimezone()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  return {
    timezone,
    organizationId,
    loading,
    refetch,
    setTimezone,
  }
}
