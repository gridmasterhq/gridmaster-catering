import { useMemo } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'

interface TemplateFilterPillsProps {
  eventTypeValues: string[]
  selectedFilter: string
  onSelectFilter: (value: string) => void
}

export default function TemplateFilterPills({
  eventTypeValues,
  selectedFilter,
  onSelectFilter,
}: TemplateFilterPillsProps) {
  const { colors, event_types } = useProductConfig()

  const eventTypeMap = useMemo(
    () => new Map(event_types.map((type) => [type.value, type])),
    [event_types],
  )

  if (eventTypeValues.length === 0) {
    return null
  }

  const pillBase = {
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '9999px',
    padding: '4px 12px',
    cursor: 'pointer',
    border: '1px solid transparent',
    whiteSpace: 'nowrap' as const,
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelectFilter('all')}
        style={{
          ...pillBase,
          backgroundColor: selectedFilter === 'all' ? colors.brand_navy : colors.white,
          color: selectedFilter === 'all' ? colors.white : colors.brand_navy,
          borderColor: selectedFilter === 'all' ? colors.brand_navy : '#E5E7EB',
        }}
      >
        All
      </button>
      {eventTypeValues.map((value) => {
        const typeConfig = eventTypeMap.get(value)
        const isSelected = selectedFilter === value
        const typeColor = typeConfig?.color ?? colors.brand_navy

        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelectFilter(value)}
            style={{
              ...pillBase,
              backgroundColor: isSelected ? typeColor : colors.white,
              color: isSelected ? colors.white : typeColor,
              borderColor: isSelected ? typeColor : '#E5E7EB',
            }}
          >
            {typeConfig?.label ?? value}
          </button>
        )
      })}
    </div>
  )
}
