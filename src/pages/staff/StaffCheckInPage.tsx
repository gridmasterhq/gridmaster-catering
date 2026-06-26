import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import GeofenceCheckIn from '../../components/staff/GeofenceCheckIn'
import { supabase } from '../../lib/supabase'

interface CheckInContext {
  event_id: string
  staff_phone: string
  organization_id: string
  venue_lat: number
  venue_lng: number
  radius_meters: number
  captain_phone: string
  staff_name: string
  event_name: string
  call_time: string
  check_in_opens_at: string
}

function formatCallTime(timeValue: string | null): string {
  if (!timeValue) {
    return 'TBD'
  }

  const match = timeValue.match(/^(\d{1,2}):(\d{2})/)
  if (!match) {
    return timeValue
  }

  const hours = Number(match[1])
  const minutes = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'
  const hour12 = hours % 12 || 12
  return `${hour12}:${minutes} ${period}`
}

function buildCheckInOpensAt(eventDate: string | null, callTime: string | null): string {
  if (!eventDate || !callTime) {
    return new Date().toISOString()
  }

  const dateOnly = eventDate.split('T')[0]
  const timeMatch = callTime.match(/^(\d{1,2}):(\d{2})/)
  const hours = timeMatch ? timeMatch[1].padStart(2, '0') : '00'
  const minutes = timeMatch ? timeMatch[2] : '00'
  const callDateTime = new Date(`${dateOnly}T${hours}:${minutes}:00`)
  return new Date(callDateTime.getTime() - 60 * 60 * 1000).toISOString()
}

function StaffCheckInPage() {
  const [searchParams] = useSearchParams()
  const [context, setContext] = useState<CheckInContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  const eventId = searchParams.get('event')
  const staffPhone = searchParams.get('phone') ?? searchParams.get('token')

  useEffect(() => {
    async function loadCheckInContext() {
      if (!eventId || !staffPhone) {
        setError('Missing event or staff information in this link.')
        return
      }

      const { data: event, error: eventError } = await supabase
        .from('events')
        .select(
          `
          id,
          organization_id,
          event_name,
          event_date,
          event_start_time,
          client_locations (
            latitude,
            longitude,
            geofence_radius_meters
          )
        `,
        )
        .eq('id', eventId)
        .single()

      if (eventError || !event) {
        setError('Unable to load event details for check-in.')
        return
      }

      const location = Array.isArray(event.client_locations)
        ? event.client_locations[0]
        : event.client_locations

      const venueLat = Number(location?.latitude)
      const venueLng = Number(location?.longitude)

      if (!Number.isFinite(venueLat) || !Number.isFinite(venueLng)) {
        setError('Venue location is not configured for this event.')
        return
      }

      const { data: staff } = await supabase
        .from('staff')
        .select('preferred_name, first_name')
        .eq('organization_id', event.organization_id)
        .eq('phone', staffPhone)
        .maybeSingle()

      const staffName =
        staff?.preferred_name?.trim() ||
        staff?.first_name?.trim() ||
        'Staff member'

      const { data: captainAssignment } = await supabase
        .from('event_staff_assignments')
        .select('staff_phone')
        .eq('organization_id', event.organization_id)
        .eq('event_id', eventId)
        .eq('role', 'captain')
        .eq('status', 'confirmed')
        .limit(1)
        .maybeSingle()

      if (!captainAssignment?.staff_phone) {
        setError('Captain contact is not available for this event.')
        return
      }

      const callTime = formatCallTime(event.event_start_time)

      setContext({
        event_id: event.id,
        staff_phone: staffPhone,
        organization_id: event.organization_id,
        venue_lat: venueLat,
        venue_lng: venueLng,
        radius_meters: location?.geofence_radius_meters ?? 100,
        captain_phone: captainAssignment.staff_phone,
        staff_name: staffName,
        event_name: event.event_name ?? 'Event',
        call_time: callTime,
        check_in_opens_at: buildCheckInOpensAt(
          event.event_date,
          event.event_start_time,
        ),
      })
    }

    loadCheckInContext()
  }, [eventId, staffPhone])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-6 text-center">
        <p style={{ color: '#444444', fontSize: '16px' }}>{error}</p>
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

  return <GeofenceCheckIn {...context} />
}

export default StaffCheckInPage
