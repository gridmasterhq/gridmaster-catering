import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MobileCommandCenter from '../../components/coordinator/MobileCommandCenter'
import { supabase } from '../../lib/supabase'

function MobileCommandCenterPage() {
  const [searchParams] = useSearchParams()
  const [context, setContext] = useState<{
    event_id: string
    organization_id: string
    coordinator_phone: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventId = searchParams.get('event')
  const userPhone = searchParams.get('user') ?? searchParams.get('phone')

  useEffect(() => {
    async function loadContext() {
      if (!eventId || !userPhone) {
        setError('Missing event or user information in this link.')
        return
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, organization_id')
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        setError('Unable to load event for mobile command center.')
        return
      }

      setContext({
        event_id: event.id,
        organization_id: event.organization_id,
        coordinator_phone: userPhone,
      })
    }

    loadContext()
  }, [eventId, userPhone])

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

  return <MobileCommandCenter {...context} />
}

export default MobileCommandCenterPage
