import { useEffect, useState } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'

function StaffManagementPage() {
  const { labels } = useProductConfig()
  const [staffCount, setStaffCount] = useState<number | null>(null)

  useEffect(() => {
    async function fetchStaffCount() {
      const { count, error } = await supabase
        .from('staff')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ORGANIZATION_ID)

      if (!error && count != null) {
        setStaffCount(count)
      } else {
        setStaffCount(0)
      }
    }

    fetchStaffCount()
  }, [])

  if (staffCount === null) {
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

  if (staffCount === 0) {
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
            {labels.es_staff_empty_headline}
          </p>
          <p
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginTop: '8px',
            }}
          >
            {labels.es_staff_empty_secondary}
          </p>
        </div>
      </div>
    )
  }

  return null
}

export default StaffManagementPage
