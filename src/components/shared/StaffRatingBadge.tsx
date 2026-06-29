import { useProductConfig } from '../../lib/hooks/useProductConfig'

const STAFF_RATING_GOLD = '#C9A84C'
const STAR_EMPTY_COLOR = '#D1D5DB'
const EXPERIENCE_STAR_COUNT = 6

export interface StaffRatingBadgeProps {
  experience_rating: number | null
  rating_count: number
  average_rating: number | null
  variant?: 'compact' | 'full'
}

function PerformanceRatingDisplay({
  rating_count,
  average_rating,
  starSize,
}: {
  rating_count: number
  average_rating: number | null
  starSize: number
}) {
  const { rating_floors, colors } = useProductConfig()

  if (rating_count < 6 || average_rating == null) {
    return (
      <span
        style={{
          fontSize: `${starSize === 14 ? 11 : starSize}px`,
          color: colors.text_muted,
          fontStyle: 'italic',
        }}
      >
        New
      </span>
    )
  }

  const filled = Math.min(
    Math.max(Math.round(average_rating), 0),
    rating_floors.length,
  )

  return (
    <span style={{ fontSize: `${starSize}px`, lineHeight: 1 }}>
      {rating_floors.map((star) => (
        <span
          key={star}
          style={{
            color: star <= filled ? STAFF_RATING_GOLD : STAR_EMPTY_COLOR,
          }}
        >
          {star <= filled ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

function ExperienceRatingDisplay({
  experience_rating,
  starSize,
}: {
  experience_rating: number | null
  starSize: number
}) {
  const filled =
    experience_rating == null
      ? 0
      : Math.min(Math.max(Math.round(experience_rating), 0), EXPERIENCE_STAR_COUNT)

  return (
    <span style={{ fontSize: `${starSize}px`, lineHeight: 1 }}>
      {Array.from({ length: EXPERIENCE_STAR_COUNT }, (_, index) => {
        const star = index + 1
        return (
          <span
            key={star}
            style={{
              color: star <= filled ? STAFF_RATING_GOLD : STAR_EMPTY_COLOR,
            }}
          >
            {star <= filled ? '★' : '☆'}
          </span>
        )
      })}
    </span>
  )
}

export default function StaffRatingBadge({
  experience_rating,
  rating_count,
  average_rating,
  variant = 'compact',
}: StaffRatingBadgeProps) {
  const { colors } = useProductConfig()

  if (experience_rating == null && rating_count === 0) {
    return null
  }

  const starSize = variant === 'full' ? 14 : 12

  if (variant === 'full') {
    return (
      <div className="flex flex-col" style={{ gap: '4px' }}>
        <div className="flex flex-wrap items-center" style={{ gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              color: colors.brand_navy,
            }}
          >
            Performance Rating:
          </span>
          <PerformanceRatingDisplay
            rating_count={rating_count}
            average_rating={average_rating}
            starSize={starSize}
          />
        </div>
        <div className="flex flex-wrap items-center" style={{ gap: '8px' }}>
          <span
            style={{
              fontSize: '12px',
              color: colors.brand_navy,
            }}
          >
            Experience Rating:
          </span>
          <ExperienceRatingDisplay
            experience_rating={experience_rating}
            starSize={starSize}
          />
        </div>
      </div>
    )
  }

  return (
    <span className="inline-flex items-center" style={{ gap: '8px' }}>
      <PerformanceRatingDisplay
        rating_count={rating_count}
        average_rating={average_rating}
        starSize={starSize}
      />
      <span
        aria-hidden="true"
        style={{
          width: '1px',
          height: '12px',
          backgroundColor: '#E5E7EB',
          flexShrink: 0,
        }}
      />
      <ExperienceRatingDisplay
        experience_rating={experience_rating}
        starSize={starSize}
      />
    </span>
  )
}
