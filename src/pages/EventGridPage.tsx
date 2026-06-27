import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useProductConfig } from '../lib/hooks/useProductConfig'
import { supabase } from '../lib/supabase'

export default function EventGridPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { colors } = useProductConfig()
  const [eventName, setEventName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) {
      setEventName('Unknown Event')
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadEvent() {
      const { data, error } = await supabase
        .from('events')
        .select('event_name')
        .eq('id', eventId)
        .single()

      if (cancelled) {
        return
      }

      if (error || !data?.event_name) {
        setEventName('Unknown Event')
      } else {
        setEventName(data.event_name)
      }

      setLoading(false)
    }

    void loadEvent()

    return () => {
      cancelled = true
    }
  }, [eventId])

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: colors.brand_light_blue }}
      >
        <div
          className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ backgroundColor: colors.brand_light_blue }}
    >
      <p
        className="text-center"
        style={{ fontSize: '16px', fontWeight: 500, color: colors.brand_navy }}
      >
        Event Grid — {eventName} — Coming Soon
      </p>
    </div>
  )
}
