import { useMemo, useState } from 'react'
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import {
  checkGeofence,
  fireCaptainFailureSMS,
  recordCheckIn,
} from '../../services/geofenceService'

type CheckInState =
  | 'idle'
  | 'checking'
  | 'success'
  | 'failure_1'
  | 'failure_2'
  | 'too_early'

interface GeofenceCheckInProps {
  event_id: string
  staff_phone: string
  organization_id: string
  venue_lat: number
  venue_lng: number
  radius_meters?: number
  captain_phone: string
  staff_name: string
  event_name: string
  call_time: string
  check_in_opens_at: string
}

function GridMasterStaffHeader() {
  const { brand_name } = useProductConfig()
  const hqIndex = brand_name.lastIndexOf(' ')
  const gridMasterWordmark =
    hqIndex === -1 ? brand_name : brand_name.slice(0, hqIndex)
  const hqWordmark = hqIndex === -1 ? '' : brand_name.slice(hqIndex + 1)

  return (
    <header
      style={{
        backgroundColor: '#1B3A5C',
        padding: '14px 16px',
        textAlign: 'center',
      }}
    >
      <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 600 }}>
        {gridMasterWordmark}
      </span>
      {hqWordmark ? (
        <span style={{ color: '#E74C3C', fontSize: '16px', fontWeight: 600 }}>
          {hqWordmark}
        </span>
      ) : null}
    </header>
  )
}

function LoadingSpinner() {
  return (
    <div
      className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
      role="status"
      aria-label="Loading"
    />
  )
}

export default function GeofenceCheckIn({
  event_id,
  staff_phone,
  organization_id,
  venue_lat,
  venue_lng,
  radius_meters = 100,
  captain_phone,
  staff_name,
  event_name,
  call_time,
  check_in_opens_at,
}: GeofenceCheckInProps) {
  const initialState: CheckInState = useMemo(() => {
    if (Date.now() < new Date(check_in_opens_at).getTime()) {
      return 'too_early'
    }
    return 'idle'
  }, [check_in_opens_at])

  const [state, setState] = useState<CheckInState>(initialState)
  const [attemptCount, setAttemptCount] = useState(0)

  async function handleCheckIn() {
    const nextAttempt = attemptCount + 1
    setState('checking')

    const geofenceResult = await checkGeofence({
      venue_lat,
      venue_lng,
      radius_meters,
    })

    if (geofenceResult.success) {
      await recordCheckIn({
        organization_id,
        event_id,
        staff_phone,
        checkin_method: 'geofence',
        geofence_attempt_count: nextAttempt,
        device_lat: geofenceResult.device_lat,
        device_lng: geofenceResult.device_lng,
      })
      setState('success')
      return
    }

    if (nextAttempt === 1) {
      setAttemptCount(1)
      setState('failure_1')
      return
    }

    const checkInResult = await recordCheckIn({
      organization_id,
      event_id,
      staff_phone,
      checkin_method: 'geofence',
      geofence_attempt_count: 2,
      gps_failure_reason: geofenceResult.gps_failure_reason,
      device_lat: geofenceResult.device_lat,
      device_lng: geofenceResult.device_lng,
    })

    await fireCaptainFailureSMS({
      organization_id,
      event_id,
      staff_phone,
      staff_name,
      captain_phone,
      check_in_id: checkInResult.check_in_id,
    })

    setState('failure_2')
  }

  if (state === 'success') {
    return (
      <div
        className="flex min-h-screen flex-col"
        style={{ backgroundColor: '#22C55E' }}
      >
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-white">
          <IconCircleCheck size={80} stroke={1.5} color="#ffffff" />
          <p style={{ fontSize: '24px', fontWeight: 600, marginTop: '20px' }}>
            You&apos;re checked in! ✓
          </p>
          <p style={{ fontSize: '18px', marginTop: '12px' }}>{event_name}</p>
          <p style={{ fontSize: '16px', marginTop: '8px', opacity: 0.95 }}>
            Call time: {call_time}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <GridMasterStaffHeader />

      <main className="flex flex-1 flex-col px-5 py-8">
        <div className="mb-8 text-center">
          <p
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: '#1B3A5C',
            }}
          >
            {event_name}
          </p>
          <p style={{ fontSize: '16px', color: '#444444', marginTop: '8px' }}>
            Call time: {call_time}
          </p>
        </div>

        {state === 'too_early' ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p style={{ fontSize: '16px', color: '#444444', lineHeight: 1.5 }}>
              Check-in opens 1 hour before your call time of {call_time}.
            </p>
          </div>
        ) : null}

        {state === 'checking' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <LoadingSpinner />
            <p style={{ fontSize: '16px', color: '#444444' }}>
              Verifying your location...
            </p>
          </div>
        ) : null}

        {state === 'idle' ? (
          <div className="mt-auto">
            <button
              type="button"
              onClick={handleCheckIn}
              style={{
                width: '100%',
                minHeight: '56px',
                borderRadius: '10px',
                backgroundColor: '#1B3A5C',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Check In
            </button>
          </div>
        ) : null}

        {state === 'failure_1' ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <IconAlertTriangle size={48} color="#F59E0B" stroke={1.75} />
            <p
              style={{
                fontSize: '16px',
                color: '#444444',
                marginTop: '16px',
                lineHeight: 1.5,
              }}
            >
              We couldn&apos;t verify your location. Make sure location sharing is
              on and try again.
            </p>
            <button
              type="button"
              onClick={handleCheckIn}
              style={{
                width: '100%',
                minHeight: '56px',
                borderRadius: '10px',
                backgroundColor: '#1B3A5C',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                marginTop: '24px',
              }}
            >
              Try Again
            </button>
          </div>
        ) : null}

        {state === 'failure_2' ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <IconAlertTriangle size={48} color="#F59E0B" stroke={1.75} />
            <p
              style={{
                fontSize: '16px',
                color: '#444444',
                marginTop: '16px',
                lineHeight: 1.5,
              }}
            >
              Still having trouble? We&apos;ve notified your captain. They can check
              you in manually.
            </p>
            <button
              type="button"
              style={{
                width: '100%',
                minHeight: '56px',
                borderRadius: '10px',
                backgroundColor: '#1B3A5C',
                color: '#ffffff',
                fontSize: '18px',
                fontWeight: 600,
                border: 'none',
                cursor: 'pointer',
                marginTop: '24px',
              }}
            >
              Done
            </button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
