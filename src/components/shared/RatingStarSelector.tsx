import { useEffect, useRef, useState } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'

export interface RatingStarSelectorProps {
  value: number | null
  onChange: (rating: number) => void
  onSubmit?: (rating: number) => void
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
  label?: string
  showConfirmButton?: boolean
}

const SIZE_CLASS = {
  sm: 'text-base leading-none',
  md: 'text-2xl leading-none',
  lg: 'text-[32px] leading-none',
} as const

const LONG_PRESS_MS = 500

function RatingStarSelector({
  value,
  onChange,
  onSubmit,
  disabled = false,
  size = 'md',
  label,
  showConfirmButton = false,
}: RatingStarSelectorProps) {
  const { rating_floors, labels } = useProductConfig()

  const [selected, setSelected] = useState<number | null>(value)
  const [hasTapped, setHasTapped] = useState(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSelected(value)
  }, [value])

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => clearLongPressTimer, [])

  const handleStarSelect = (rating: number) => {
    if (disabled || rating < 1) {
      return
    }

    if (rating === 1 && selected === 1) {
      return
    }

    setSelected(rating)
    setHasTapped(true)
    onChange(rating)
  }

  const handleConfirm = () => {
    if (disabled || selected === null || selected < 1 || !onSubmit) {
      return
    }

    onSubmit(selected)
    setHasTapped(false)
  }

  const handleLongPressStart = (rating: number) => {
    if (
      disabled ||
      showConfirmButton ||
      !onSubmit ||
      selected === null ||
      rating < 1 ||
      rating > selected
    ) {
      return
    }

    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      if (selected !== null && selected >= 1) {
        onSubmit(selected)
      }
      longPressTimerRef.current = null
    }, LONG_PRESS_MS)
  }

  const starSizeClass = SIZE_CLASS[size]
  const filledThreshold = selected ?? 0

  return (
    <div className="inline-flex flex-col gap-2">
      {label ? (
        <span className="text-sm font-medium text-text-body">{label}</span>
      ) : null}

      <div
        className="inline-flex items-center gap-0.5"
        role="group"
        aria-label={label ?? 'Rating selector'}
      >
        {rating_floors.map((star) => {
          const isFilled = !disabled && star <= filledThreshold
          const starClassName = disabled
            ? 'text-status-neutral cursor-not-allowed'
            : isFilled
              ? 'text-status-amber cursor-pointer'
              : 'text-status-neutral cursor-pointer'

          return (
            <button
              key={star}
              type="button"
              disabled={disabled}
              className={`${starSizeClass} ${starClassName} select-none disabled:pointer-events-none`}
              aria-label={`${star} star${star === 1 ? '' : 's'}`}
              aria-pressed={isFilled}
              onClick={() => handleStarSelect(star)}
              onPointerDown={() => handleLongPressStart(star)}
              onPointerUp={clearLongPressTimer}
              onPointerLeave={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
            >
              {isFilled ? '★' : '☆'}
            </button>
          )
        })}
      </div>

      {showConfirmButton && hasTapped && selected !== null && selected >= 1 ? (
        <button
          type="button"
          disabled={disabled || !onSubmit}
          className="rounded bg-brand-navy px-3 py-1 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleConfirm}
        >
          {labels.confirm}
        </button>
      ) : null}
    </div>
  )
}

export default RatingStarSelector
