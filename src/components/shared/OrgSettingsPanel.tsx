import { useCallback, useEffect, useState } from 'react'
import { useOrgTimezone } from '../../hooks/useOrgTimezone'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import OverlayPanel from './OverlayPanel'

const US_TIMEZONE_OPTIONS = [
  { iana: 'America/New_York', label: 'Eastern Time (ET)' },
  { iana: 'America/Chicago', label: 'Central Time (CT)' },
  { iana: 'America/Denver', label: 'Mountain Time (MT)' },
  { iana: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { iana: 'America/Phoenix', label: 'Arizona (no DST)' },
  { iana: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { iana: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
] as const

interface OrgSettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function OrgSettingsPanel({
  isOpen,
  onClose,
}: OrgSettingsPanelProps) {
  const { colors } = useProductConfig()
  const {
    timezone,
    organizationId,
    loading,
    refetch,
    setTimezone: setOrgTimezone,
  } = useOrgTimezone()
  const [selectedTimezone, setSelectedTimezone] = useState(timezone)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setSelectedTimezone(timezone)
      setSaved(false)
    }
  }, [isOpen, timezone])

  const handleTimezoneChange = useCallback(
    async (nextTimezone: string) => {
      setSelectedTimezone(nextTimezone)

      if (!organizationId) {
        return
      }

      setSaving(true)
      const { error } = await supabase
        .from('organizations')
        .update({ timezone: nextTimezone })
        .eq('id', organizationId)

      setSaving(false)

      if (error) {
        console.error('[OrgSettingsPanel] timezone update failed', error)
        setSelectedTimezone(timezone)
        return
      }

      setOrgTimezone(nextTimezone)
      refetch()
      setSaved(true)
      window.setTimeout(() => {
        setSaved(false)
      }, 2000)
    },
    [organizationId, refetch, setOrgTimezone, timezone],
  )

  return (
    <OverlayPanel
      isOpen={isOpen}
      title="Settings"
      dismissable
      onClose={onClose}
    >
      <div style={{ padding: '16px' }}>
        <h3
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: colors.brand_navy,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '12px',
          }}
        >
          Organization
        </h3>

        <div style={{ marginBottom: '24px' }}>
          <label
            htmlFor="org-timezone-select"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 500,
              color: '#374151',
              marginBottom: '6px',
            }}
          >
            Timezone
          </label>
          <div className="flex items-center gap-2">
            <select
              id="org-timezone-select"
              value={selectedTimezone}
              disabled={loading || saving || !organizationId}
              onChange={(event) => {
                void handleTimezoneChange(event.target.value)
              }}
              className="min-w-0 flex-1 outline-none"
              style={{
                height: '36px',
                fontSize: '13px',
                padding: '0 10px',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                color: '#1F2937',
                backgroundColor: '#ffffff',
              }}
            >
              {!US_TIMEZONE_OPTIONS.some(
                (option) => option.iana === selectedTimezone,
              ) ? (
                <option value={selectedTimezone}>{selectedTimezone}</option>
              ) : null}
              {US_TIMEZONE_OPTIONS.map((option) => (
                <option key={option.iana} value={option.iana}>
                  {option.label} — {option.iana}
                </option>
              ))}
            </select>
            {saved ? (
              <span
                style={{
                  fontSize: '12px',
                  color: '#22C55E',
                  whiteSpace: 'nowrap',
                }}
              >
                Saved
              </span>
            ) : null}
          </div>
        </div>

        <h3
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: colors.brand_navy,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Platform Defaults
        </h3>
        <p style={{ fontSize: '13px', color: '#9CA3AF', margin: 0 }}>
          Coming soon
        </p>
      </div>
    </OverlayPanel>
  )
}
