import { supabase } from '../lib/supabase'
import { sendBroadcastSMS } from './smsBroadcastEngine'

export type GpsFailureReason =
  | 'location_permissions_off'
  | 'poor_signal'
  | 'other'

export type CheckinMethod =
  | 'geofence'
  | 'captain_override'
  | 'coordinator_override'

export interface CheckGeofenceParams {
  venue_lat: number
  venue_lng: number
  radius_meters?: number
}

export interface GeofenceCheckResult {
  success: boolean
  distance_meters: number
  gps_failure_reason?: GpsFailureReason
  device_lat?: number
  device_lng?: number
}

export interface RecordCheckInParams {
  organization_id: string
  event_id: string
  staff_phone: string
  checkin_method: CheckinMethod
  geofence_attempt_count: number
  gps_failure_reason?: GpsFailureReason
  captain_override_by?: string
  venue_failure_flag?: boolean
  device_lat?: number
  device_lng?: number
}

export interface RecordCheckInResult {
  success: boolean
  check_in_id: string
}

export interface FireCaptainFailureSMSParams {
  organization_id: string
  event_id: string
  staff_phone: string
  staff_name: string
  captain_phone: string
  check_in_id: string
}

const DEFAULT_RADIUS_METERS = 100
const POOR_SIGNAL_ACCURACY_METERS = 200
const GEOLOCATION_TIMEOUT_MS = 15000

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusMeters = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: GEOLOCATION_TIMEOUT_MS,
      maximumAge: 0,
    })
  })
}

export async function checkGeofence(
  params: CheckGeofenceParams,
): Promise<GeofenceCheckResult> {
  const radiusMeters = params.radius_meters ?? DEFAULT_RADIUS_METERS

  let position: GeolocationPosition
  try {
    position = await getCurrentPosition()
  } catch (error) {
    const geoError = error as GeolocationPositionError
    if (geoError.code === 1) {
      return {
        success: false,
        distance_meters: 0,
        gps_failure_reason: 'location_permissions_off',
      }
    }

    return {
      success: false,
      distance_meters: 0,
      gps_failure_reason: 'other',
    }
  }

  const deviceLat = position.coords.latitude
  const deviceLng = position.coords.longitude
  const accuracy = position.coords.accuracy

  if (accuracy > POOR_SIGNAL_ACCURACY_METERS) {
    return {
      success: false,
      distance_meters: 0,
      gps_failure_reason: 'poor_signal',
      device_lat: deviceLat,
      device_lng: deviceLng,
    }
  }

  const distanceMeters = haversineDistanceMeters(
    deviceLat,
    deviceLng,
    params.venue_lat,
    params.venue_lng,
  )

  if (distanceMeters <= radiusMeters) {
    return {
      success: true,
      distance_meters: distanceMeters,
      device_lat: deviceLat,
      device_lng: deviceLng,
    }
  }

  return {
    success: false,
    distance_meters: distanceMeters,
    gps_failure_reason: 'other',
    device_lat: deviceLat,
    device_lng: deviceLng,
  }
}

async function detectClusterFailure(
  organizationId: string,
  eventId: string,
  checkInId: string,
): Promise<boolean> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('check_ins')
    .select('id, gps_failure_reason')
    .eq('organization_id', organizationId)
    .eq('event_id', eventId)
    .gte('checked_in_at', thirtyMinutesAgo)

  if (error || !data) {
    return false
  }

  const failureCount = data.filter(
    (row) =>
      typeof row.gps_failure_reason === 'string' &&
      row.gps_failure_reason.length > 0,
  ).length

  if (failureCount < 3) {
    return false
  }

  const { error: updateError } = await supabase
    .from('check_ins')
    .update({ venue_failure_flag: true })
    .eq('id', checkInId)
    .eq('organization_id', organizationId)

  if (updateError) {
    console.error('Failed to set venue_failure_flag', updateError.message)
    return false
  }

  console.warn(
    `[Geofence] Cluster failure detected for event ${eventId}: ${failureCount} GPS failures in 30 minutes`,
  )

  return true
}

export async function recordCheckIn(
  params: RecordCheckInParams,
): Promise<RecordCheckInResult> {
  const checkedInAt = new Date().toISOString()
  let venueFailureFlag = params.venue_failure_flag ?? false

  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      organization_id: params.organization_id,
      event_id: params.event_id,
      staff_phone: params.staff_phone,
      checkin_method: params.checkin_method,
      geofence_attempt_count: params.geofence_attempt_count,
      gps_failure_reason: params.gps_failure_reason ?? null,
      captain_override_by: params.captain_override_by ?? null,
      venue_failure_flag: venueFailureFlag,
      checked_in_at: checkedInAt,
      device_latitude: params.device_lat ?? null,
      device_longitude: params.device_lng ?? null,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Failed to record check-in')
  }

  if (params.gps_failure_reason) {
    const clusterDetected = await detectClusterFailure(
      params.organization_id,
      params.event_id,
      data.id,
    )
    venueFailureFlag = clusterDetected || venueFailureFlag
  } else {
    const { error: assignmentError } = await supabase
      .from('event_staff_assignments')
      .update({
        status: 'confirmed',
        checked_in_at: checkedInAt,
      })
      .eq('organization_id', params.organization_id)
      .eq('event_id', params.event_id)
      .eq('staff_phone', params.staff_phone)

    if (assignmentError) {
      console.error('Failed to update assignment check-in', assignmentError.message)
    }
  }

  return {
    success: true,
    check_in_id: data.id,
  }
}

export async function fireCaptainFailureSMS(
  params: FireCaptainFailureSMSParams,
): Promise<void> {
  const messageBody =
    `GPS Alert — ${params.staff_name} is unable to check in via geofence. ` +
    `Please verify their arrival and approve manual check-in from your captain portal.`

  await sendBroadcastSMS({
    organization_id: params.organization_id,
    event_id: params.event_id,
    recipients: [{ staff_phone: params.captain_phone }],
    message_type: 'broadcast',
    message_body: messageBody,
    bypass_anti_fatigue: true,
  })

  const { error } = await supabase
    .from('check_ins')
    .update({ captain_sms_sent_at: new Date().toISOString() })
    .eq('id', params.check_in_id)
    .eq('organization_id', params.organization_id)

  if (error) {
    console.error('Failed to update captain_sms_sent_at', error.message)
  }
}

export async function captureDeviceCoordinates(): Promise<{
  device_lat: number | null
  device_lng: number | null
}> {
  try {
    const position = await getCurrentPosition()
    return {
      device_lat: position.coords.latitude,
      device_lng: position.coords.longitude,
    }
  } catch {
    return {
      device_lat: null,
      device_lng: null,
    }
  }
}
