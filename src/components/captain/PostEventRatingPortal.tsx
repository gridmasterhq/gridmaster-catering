import { useEffect, useMemo, useState } from 'react'
import { IconCircleCheck } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import RatingStarSelector from '../shared/RatingStarSelector'
import { sendBroadcastSMS } from '../../services/smsBroadcastEngine'
import { supabase } from '../../lib/supabase'

type PortalState = 'loading' | 'rating' | 'submitting' | 'complete'

interface PostEventRatingPortalProps {
  event_id: string
  captain_phone: string
  organization_id: string
}

interface StaffRatingRow {
  staff_phone: string
  display_name: string
  role_at_event: string
  photo_url: string | null
  rating_count: number
  stars: number | null
  notes: string
}

function GridMasterPortalHeader({
  subtitle,
}: {
  subtitle: string
}) {
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
      <div>
        <span style={{ color: '#ffffff', fontSize: '16px', fontWeight: 600 }}>
          {gridMasterWordmark}
        </span>
        {hqWordmark ? (
          <span style={{ color: '#E74C3C', fontSize: '16px', fontWeight: 600 }}>
            {hqWordmark}
          </span>
        ) : null}
      </div>
      <p style={{ color: '#D5E8F0', fontSize: '12px', marginTop: '4px' }}>
        {subtitle}
      </p>
    </header>
  )
}

function initialsAvatar(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export default function PostEventRatingPortal({
  event_id,
  captain_phone,
  organization_id,
}: PostEventRatingPortalProps) {
  const [state, setState] = useState<PortalState>('loading')
  const [eventName, setEventName] = useState('Event')
  const [captainName, setCaptainName] = useState('Captain')
  const [coordinatorPhone, setCoordinatorPhone] = useState<string | null>(null)
  const [rows, setRows] = useState<StaffRatingRow[]>([])

  useEffect(() => {
    async function loadPortalData() {
      const { data: event } = await supabase
        .from('events')
        .select('event_name')
        .eq('id', event_id)
        .eq('organization_id', organization_id)
        .single()

      if (event?.event_name) {
        setEventName(event.event_name)
      }

      const { data: captainAssignment } = await supabase
        .from('event_staff_assignments')
        .select('section')
        .eq('event_id', event_id)
        .eq('organization_id', organization_id)
        .eq('staff_phone', captain_phone)
        .maybeSingle()

      const captainSection = captainAssignment?.section

      const { data: captainStaff } = await supabase
        .from('staff')
        .select('preferred_name, first_name, display_name')
        .eq('organization_id', organization_id)
        .eq('phone', captain_phone)
        .maybeSingle()

      setCaptainName(
        captainStaff?.preferred_name?.trim() ||
          captainStaff?.display_name?.trim() ||
          captainStaff?.first_name?.trim() ||
          'Captain',
      )

      const { data: coordinatorUser } = await supabase
        .from('users')
        .select('phone')
        .eq('organization_id', organization_id)
        .eq('role', 'coordinator')
        .limit(1)
        .maybeSingle()

      setCoordinatorPhone(
        typeof coordinatorUser?.phone === 'string'
          ? coordinatorUser.phone
          : null,
      )

      let assignmentQuery = supabase
        .from('event_staff_assignments')
        .select('staff_phone, role, section')
        .eq('event_id', event_id)
        .eq('organization_id', organization_id)
        .neq('staff_phone', captain_phone)

      if (captainSection) {
        assignmentQuery = assignmentQuery.eq('section', captainSection)
      }

      const { data: assignments } = await assignmentQuery

      const phones = (assignments ?? [])
        .map((row) => row.staff_phone)
        .filter((phone): phone is string => typeof phone === 'string')

      if (phones.length === 0) {
        setRows([])
        setState('rating')
        return
      }

      const { data: staffRows } = await supabase
        .from('staff')
        .select(
          'phone, preferred_name, first_name, display_name, photo_url, rating_count',
        )
        .eq('organization_id', organization_id)
        .in('phone', phones)

      const staffByPhone = new Map(
        (staffRows ?? []).map((staff) => [staff.phone, staff]),
      )

      setRows(
        (assignments ?? []).map((assignment) => {
          const staff = staffByPhone.get(assignment.staff_phone)
          const displayName =
            staff?.preferred_name?.trim() ||
            staff?.display_name?.trim() ||
            staff?.first_name?.trim() ||
            assignment.staff_phone

          return {
            staff_phone: assignment.staff_phone,
            display_name: displayName,
            role_at_event: assignment.role ?? 'Staff',
            photo_url: staff?.photo_url ?? null,
            rating_count: staff?.rating_count ?? 0,
            stars: null,
            notes: '',
          }
        }),
      )
      setState('rating')
    }

    loadPortalData()
  }, [captain_phone, event_id, organization_id])

  const hasAnyRating = useMemo(
    () => rows.some((row) => row.stars != null && row.stars >= 1),
    [rows],
  )

  function updateRow(
    staffPhone: string,
    patch: Partial<Pick<StaffRatingRow, 'stars' | 'notes'>>,
  ) {
    setRows((current) =>
      current.map((row) =>
        row.staff_phone === staffPhone ? { ...row, ...patch } : row,
      ),
    )
  }

  async function handleSubmitAll() {
    const ratedRows = rows.filter((row) => row.stars != null && row.stars >= 1)
    if (ratedRows.length === 0) {
      return
    }

    setState('submitting')

    for (const row of ratedRows) {
      const { error } = await supabase.from('ratings').insert({
        organization_id,
        event_id,
        staff_phone: row.staff_phone,
        rater_phone: captain_phone,
        rater_role: 'captain',
        stars: row.stars,
        notes: row.notes.trim() || null,
        role_at_event: row.role_at_event,
        is_cit_rating: false,
        is_trainer_rating: false,
        is_disputed: false,
        created_at: new Date().toISOString(),
      })

      if (error) {
        console.error('Failed to insert rating', error.message)
      }
    }

    const oneStarRows = ratedRows.filter((row) => row.stars === 1)
    if (oneStarRows.length > 0 && coordinatorPhone) {
      for (const row of oneStarRows) {
        await sendBroadcastSMS({
          organization_id,
          event_id,
          recipients: [{ staff_phone: coordinatorPhone }],
          message_type: 'broadcast',
          message_body:
            `Rating Alert — ${row.display_name} received a 1-star rating from ` +
            `${captainName} at ${eventName}. Review required before their next assignment.`,
          bypass_anti_fatigue: true,
        })
      }
    }

    setState('complete')
  }

  if (state === 'loading' || state === 'submitting') {
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

  if (state === 'complete') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: '#1B3A5C' }}
      >
        <IconCircleCheck size={64} color="#ffffff" stroke={1.5} />
        <p
          style={{
            color: '#ffffff',
            fontSize: '22px',
            fontWeight: 600,
            marginTop: '16px',
          }}
        >
          Ratings submitted. Thank you.
        </p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-white pb-24">
      <GridMasterPortalHeader subtitle={eventName} />

      <main className="px-4 py-5">
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1B3A5C',
            marginBottom: '16px',
          }}
        >
          Rate Your Crew
        </h1>

        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <div
              key={row.staff_phone}
              className="rounded-lg border border-gray-200 p-4"
            >
              <div className="flex items-start gap-3">
                {row.photo_url ? (
                  <img
                    src={row.photo_url}
                    alt=""
                    className="size-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex size-12 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: '#1B3A5C' }}
                  >
                    {initialsAvatar(row.display_name)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      {row.display_name}
                    </p>
                    {row.rating_count < 3 ? (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          color: '#92400E',
                          backgroundColor: '#FEF3C7',
                          borderRadius: '999px',
                          padding: '2px 8px',
                        }}
                      >
                        PROVISIONAL
                      </span>
                    ) : null}
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280' }}>
                    {row.role_at_event}
                  </p>
                </div>

                <RatingStarSelector
                  value={row.stars}
                  onChange={(rating) =>
                    updateRow(row.staff_phone, { stars: rating })
                  }
                  size="md"
                />
              </div>

              <input
                type="text"
                value={row.notes}
                onChange={(event) =>
                  updateRow(row.staff_phone, { notes: event.target.value })
                }
                placeholder="Optional note — coordinator only"
                className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm text-text-body focus:border-brand-navy focus:outline-none"
              />
            </div>
          ))}
        </div>
      </main>

      <div
        className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-4"
        style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          disabled={!hasAnyRating}
          onClick={handleSubmitAll}
          style={{
            width: '100%',
            minHeight: '56px',
            borderRadius: '10px',
            backgroundColor: hasAnyRating ? '#1B3A5C' : '#9ca3af',
            color: '#ffffff',
            fontSize: '17px',
            fontWeight: 600,
            border: 'none',
            cursor: hasAnyRating ? 'pointer' : 'not-allowed',
          }}
        >
          Submit All Ratings
        </button>
      </div>
    </div>
  )
}
