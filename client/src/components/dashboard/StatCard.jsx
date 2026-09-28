import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Card, Skeleton, cx } from '../ui'
import { useCountUp } from '../../lib/motion'

const ICON_TONE = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-green-50 text-green-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-700',
  violet: 'bg-violet-50 text-violet-700',
  slate: 'bg-slate-100 text-slate-600',
}

function Value({ value, decimals, suffix }) {
  const n = useCountUp(typeof value === 'number' ? value : undefined)
  if (typeof value !== 'number') return value
  return `${decimals ? n.toFixed(decimals) : Math.round(n).toLocaleString()}${suffix ?? ''}`
}

/**
 * A single headline number. `value` undefined renders a skeleton; numbers count up on first render.
 * `to` makes the whole card a link; `hint` is the supporting line underneath.
 */
export function StatCard({ label, value, hint, icon: Icon, tone = 'brand', to, decimals, suffix, className, index = 0 }) {
  const body = (
    <Card
      className={cx('stagger flex h-full animate-fade-up items-start gap-4 p-5', to && 'transition hover:shadow-md hover:ring-brand-300', className)}
      style={{ '--i': index }}
    >
      {Icon && (
        <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-lg', ICON_TONE[tone])}>
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {value === undefined
          ? <Skeleton className="mt-1.5 h-7 w-16" />
          : <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums"><Value value={value} decimals={decimals} suffix={suffix} /></p>}
        {hint && <p className="mt-0.5 truncate text-xs text-slate-500">{hint}</p>}
      </div>
      {to && <ArrowUpRight className="size-4 shrink-0 text-slate-400" aria-hidden />}
    </Card>
  )
  return to ? <Link to={to} className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">{body}</Link> : body
}

export function StatGrid({ children, className }) {
  return <div className={cx('grid gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
}
