import { useEffect, useState } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'

function FillPositionsPage() {
  const { labels } = useProductConfig()
  const [isFullyStaffed, setIsFullyStaffed] = useState<boolean | null>(null)

  useEffect(() => {
    async function fetchStaffingStatus() {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id')
        .eq('organization_id', ORGANIZATION_ID)
        .eq('is_cancelled', false)
        .order('event_date', { ascending: true })
        .limit(1)

      if (eventsError || !events?.length) {
        setIsFullyStaffed(false)
        return
      }

      const eventId = events[0].id

      const [{ count: requiredCount, error: requiredError }, { count: confirmedCount, error: confirmedError }] =
        await Promise.all([
          supabase
            .from('event_grid_rows')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', ORGANIZATION_ID)
            .eq('event_id', eventId),
          supabase
            .from('event_staff_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', ORGANIZATION_ID)
            .eq('event_id', eventId)
            .eq('status', 'confirmed'),
        ])

      if (requiredError || confirmedError || requiredCount == null || confirmedCount == null) {
        setIsFullyStaffed(false)
        return
      }

      setIsFullyStaffed(requiredCount > 0 && confirmedCount >= requiredCount)
    }

    fetchStaffingStatus()
  }, [])

  if (isFullyStaffed === null) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-brand-light-blue">
        <div
          className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  if (isFullyStaffed) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-brand-light-blue px-4">
        <div className="max-w-md text-center">
          <p
            style={{
              fontSize: '15px',
              fontWeight: 500,
              color: '#111827',
            }}
          >
            {labels.es_fill_positions_staffed_headline}
          </p>
        </div>
      </div>
    )
  }

  return null
}

export default FillPositionsPage
