import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SOSCenter from '../../components/coordinator/SOSCenter'
import { supabase } from '../../lib/supabase'

type TriggerRole =
  | 'captain'
  | 'cocaptain'
  | 'cit'
  | 'culinary_lead'
  | 'supervisor'
  | 'staff'

const TRIGGER_ROLES = new Set<string>([
  'captain',
  'cocaptain',
  'cit',
  'culinary_lead',
  'supervisor',
  'staff',
])

function SOSPage() {
  const [searchParams] = useSearchParams()
  const [context, setContext] = useState<{
    event_id: string
    triggered_by: string
    trigger_role: TriggerRole
    organization_id: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventId = searchParams.get('event')
  const phone = searchParams.get('phone') ?? searchParams.get('token')
  const roleParam = searchParams.get('role') ?? 'staff'

  useEffect(() => {
    async function loadContext() {
      if (!eventId || !phone) {
        setError('Missing event or phone information in this link.')
        return
      }

      const triggerRole = TRIGGER_ROLES.has(roleParam)
        ? (roleParam as TriggerRole)
        : 'staff'

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, organization_id')
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        setError('Unable to load event for SOS center.')
        return
      }

      setContext({
        event_id: event.id,
        triggered_by: phone,
        trigger_role: triggerRole,
        organization_id: event.organization_id,
      })
    }

    loadContext()
  }, [eventId, phone, roleParam])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <p style={{ color: '#444444' }}>{error}</p>
      </div>
    )
  }

  if (!context) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div
          className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  return <SOSCenter {...context} />
}

export default SOSPage
