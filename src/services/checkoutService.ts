import { supabase } from '../lib/supabase'
import { captureDeviceCoordinates } from './geofenceService'

export type CheckoutMethod = 'code' | 'supervisor_confirmed' | 'coordinator_override'

export interface ValidateCheckoutCodeParams {
  event_id: string
  organization_id: string
  entered_code: string
}

export interface ValidateCheckoutCodeResult {
  valid: boolean
}

export interface RecordCheckOutParams {
  organization_id: string
  event_id: string
  staff_phone: string
  checkout_method: CheckoutMethod
}

export interface RecordCheckOutResult {
  success: boolean
}

export async function validateCheckoutCode(
  params: ValidateCheckoutCodeParams,
): Promise<ValidateCheckoutCodeResult> {
  const { data, error } = await supabase.rpc('validate_checkout_code', {
    p_event_id: params.event_id,
    p_organization_id: params.organization_id,
    p_entered_code: params.entered_code,
  })

  if (error) {
    console.error('Checkout code validation failed', error.message)
    return { valid: false }
  }

  return { valid: data === true }
}

export async function recordCheckOut(
  params: RecordCheckOutParams,
): Promise<RecordCheckOutResult> {
  const checkedOutAt = new Date().toISOString()
  const coordinates = await captureDeviceCoordinates()

  const { error: checkoutError } = await supabase.from('check_outs').insert({
    organization_id: params.organization_id,
    event_id: params.event_id,
    staff_phone: params.staff_phone,
    checkout_method: params.checkout_method,
    checked_out_at: checkedOutAt,
    device_latitude: coordinates.device_lat,
    device_longitude: coordinates.device_lng,
  })

  if (checkoutError) {
    throw new Error(checkoutError.message)
  }

  const { error: assignmentError } = await supabase
    .from('event_staff_assignments')
    .update({ checked_out_at: checkedOutAt })
    .eq('organization_id', params.organization_id)
    .eq('event_id', params.event_id)
    .eq('staff_phone', params.staff_phone)

  if (assignmentError) {
    console.error('Failed to update assignment check-out', assignmentError.message)
  }

  return { success: true }
}
