import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CheckoutCodeEntry from '../../components/staff/CheckoutCodeEntry'
import { supabase } from '../../lib/supabase'

function StaffCheckoutPage() {
  const [searchParams] = useSearchParams()
  const [eventName, setEventName] = useState<string | null>(null)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventId = searchParams.get('event')
  const staffPhone = searchParams.get('phone') ?? searchParams.get('token')

  useEffect(() => {
    async function loadCheckoutContext() {
      if (!eventId || !staffPhone) {
        setError('Missing event or staff information in this link.')
        return
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('id, organization_id, event_name')
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        setError('Unable to load event details for check-out.')
        return
      }

      setEventName(event.event_name ?? 'Event')
      setOrganizationId(event.organization_id)
    }

    loadCheckoutContext()
  }, [eventId, staffPhone])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <p style={{ color: '#444444', fontSize: '16px' }}>{error}</p>
      </div>
    )
  }

  if (!eventName || !organizationId || !eventId || !staffPhone) {
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

  return (
    <CheckoutCodeEntry
      event_id={eventId}
      staff_phone={staffPhone}
      organization_id={organizationId}
      event_name={eventName}
    />
  )
}

export default StaffCheckoutPage
