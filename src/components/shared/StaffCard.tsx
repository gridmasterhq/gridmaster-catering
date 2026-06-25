import { useProductConfig } from '../../lib/hooks/useProductConfig'

export interface StaffCardProps {
  phone: string
  displayName: string
  legalName: string
  photoUrl?: string
  roles: string[]
  primaryRole: string
  averageRating: number
  ratingCount: number
  status:
    | 'available'
    | 'confirmed'
    | 'checked_in'
    | 'checked_out'
    | 'no_show'
    | 'unavailable'
  availabilityPercent?: number
  showRating?: boolean
  isProvisional?: boolean
  onClick?: () => void
}

const STATUS_DOT_CLASS: Record<StaffCardProps['status'], string> = {
  available: 'bg-status-green',
  confirmed: 'bg-status-blue',
  checked_in: 'bg-status-green',
  checked_out: 'bg-status-neutral',
  no_show: 'bg-status-red',
  unavailable: 'bg-status-neutral',
}

function getInitials(displayName: string): string {
  const trimmed = displayName.trim()
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?'
}

function formatRoleLabel(role: string): string {
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function StaffCard({
  phone,
  displayName,
  legalName,
  photoUrl,
  roles: _roles,
  primaryRole,
  averageRating,
  ratingCount,
  status,
  availabilityPercent,
  showRating = false,
  isProvisional = false,
  onClick,
}: StaffCardProps) {
  const { rating_floors, features } = useProductConfig()

  const maxStars = rating_floors.length
  const filledStars = Math.min(Math.max(Math.round(averageRating), 0), maxStars)
  const shouldShowRating = showRating && features.rating_system
  const roleLabel = formatRoleLabel(primaryRole)

  const cardClassName = [
    'flex w-full items-center gap-3 rounded-lg bg-white p-3 shadow-sm transition-shadow',
    onClick ? 'cursor-pointer hover:shadow-md' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={displayName}
          className="size-10 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {getInitials(displayName)}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-text-body">{displayName}</p>
        <p className="truncate text-sm text-gray-500">{roleLabel}</p>
        {availabilityPercent !== undefined ? (
          <p className="text-xs text-gray-500">{availabilityPercent}% available</p>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={`size-2.5 rounded-full ${STATUS_DOT_CLASS[status]}`}
          aria-label={status.replace(/_/g, ' ')}
        />

        {shouldShowRating ? (
          <div className="flex items-center gap-1">
            <span className="text-sm leading-none" aria-hidden="true">
              {rating_floors.map((star) => (
                <span
                  key={star}
                  className={
                    star <= filledStars ? 'text-status-amber' : 'text-gray-300'
                  }
                >
                  {star <= filledStars ? '★' : '☆'}
                </span>
              ))}
            </span>
            <span className="text-xs text-gray-500">({ratingCount})</span>
            {isProvisional ? (
              <span className="rounded bg-status-amber px-1 text-xs font-semibold text-white">
                P
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={cardClassName}
        onClick={onClick}
        aria-label={`${displayName}, ${roleLabel}, ${legalName}, ${phone}`}
      >
        {content}
      </button>
    )
  }

  return (
    <div className={cardClassName} aria-label={`${displayName}, ${roleLabel}`}>
      {content}
    </div>
  )
}

export default StaffCard
