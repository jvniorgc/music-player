import { Star } from 'lucide-react'
import { useT } from '../../i18n'

interface StarRatingProps {
  /** Rating 0–10 (half stars); 0 = unrated. */
  value: number
  onChange?: (value: number) => void
  size?: number
  label?: string
}

const fmt = (rating: number) => String(rating / 2)

export default function StarRating({ value, onChange, size = 16, label }: StarRatingProps) {
  const { t } = useT()
  const valueText = t('reviews.ratingValue', { stars: fmt(value) })
  const stars = [0, 1, 2, 3, 4].map(i => {
    const fill = Math.max(0, Math.min(2, value - i * 2)) * 50
    return (
      <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
        <Star size={size} className="absolute inset-0 text-text-tertiary" />
        <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill}%` }}>
          <Star size={size} className="text-accent" fill="currentColor" />
        </span>
        {onChange && [1, 2].map(h => {
          const v = i * 2 + h
          return (
            <span
              key={h}
              data-testid={`star-${v}`}
              title={t('reviews.starLabel', { stars: fmt(v) })}
              className={`absolute inset-y-0 w-1/2 cursor-pointer ${h === 1 ? 'left-0' : 'right-0'}`}
              onClick={() => onChange(v)}
            />
          )
        })}
      </span>
    )
  })

  if (!onChange) {
    return <span role="img" aria-label={valueText} className="inline-flex gap-0.5">{stars}</span>
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = ({ ArrowRight: value + 1, ArrowUp: value + 1, ArrowLeft: value - 1, ArrowDown: value - 1, Home: 1, End: 10 } as Record<string, number>)[e.key]
    if (next === undefined) return
    e.preventDefault()
    onChange(Math.max(1, Math.min(10, next)))
  }

  return (
    <span
      role="slider"
      tabIndex={0}
      aria-label={label ?? t('reviews.rating')}
      aria-valuemin={1}
      aria-valuemax={10}
      aria-valuenow={value || undefined}
      aria-valuetext={valueText}
      onKeyDown={onKeyDown}
      className="inline-flex gap-1 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {stars}
    </span>
  )
}
