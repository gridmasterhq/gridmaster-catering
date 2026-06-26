import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PostEventRatingPortal from '../../components/captain/PostEventRatingPortal'
import { supabase } from '../../lib/supabase'

function CaptainRatePage() {
  const [searchParams] = useSearchParams()
  const [context, setContext] = useState<{
    event_id: string
    captain_phone: string
    organization_id: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventId = searchParams.get('event')
  const captainPhone = searchParams.get('captain') ?? searchParams.get('phone')

  useEffect(() => {
    async function loadContext() {
      if (!eventId || !captainPhone) {
        setError('Missing event or captain information in this link.')
        return
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, organization_id')
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        setError('Unable to load event for rating portal.')
        return
      }

      setContext({
        event_id: event.id,
        captain_phone: captainPhone,
        organization_id: event.organization_id,
      })
    }

    loadContext()
  }, [captainPhone, eventId])

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

  return <PostEventRatingPortal {...context} />
}

export default CaptainRatePage
