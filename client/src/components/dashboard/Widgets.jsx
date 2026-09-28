import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight } from 'lucide-react'
import { Card, CardHeader, EmptyState, ErrorState, SkeletonChart, cx } from '../ui'
import { formatDate, formatDateTime, timeAgo } from '../../lib/format'

export const greeting = (date = new Date()) => {
  const h = date.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}


export function WelcomeHeader({ name, subtitle, meta, actions }) {
  return (
    <div className="flex animate-fade-up flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
          {greeting()}, {name} <span aria-hidden></span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** A small labelled chip for the header meta row (semester, programme, level…). */
export function MetaChip({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
      {Icon && <Icon className="size-3.5 text-slate-400" aria-hidden />}
      {children}
    </span>
  )
}

/** Tiles of shortcuts. items: [{ to, label, description?, icon, onClick? }] */
export function QuickActions({ items, title = 'Quick actions', columns = 'sm:grid-cols-2' }) {
  return (
    <Card>
      <CardHeader title={title} />
      <div className={cx('grid gap-2 p-3', columns)}>
        {items.map(({ to, label, description, icon: Icon, onClick }) => {
          const inner = (
            <>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 transition group-hover:bg-brand-600 group-hover:text-white">
                <Icon className="size-4.5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800">{label}</span>
                {description && <span className="block truncate text-xs text-slate-500">{description}</span>}
              </span>
              <ChevronRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" aria-hidden />
            </>
          )
          const cls = 'group flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600'
          return onClick
            ? <button key={label} type="button" onClick={onClick} className={cls}>{inner}</button>
            : <Link key={label} to={to} className={cls}>{inner}</Link>
        })}
      </div>
    </Card>
  )
}

/** Chronological list: [{ id, title, description?, at, icon?, tone?, to? }] */
export function ActivityList({ items, empty = 'Nothing yet', emptyIcon }) {
  if (!items.length) return <EmptyState compact title={empty} icon={emptyIcon} />
  return (
    <ol className="divide-y divide-slate-100">
      {items.map((item, i) => {
        const Icon = item.icon
        const body = (
          <div className="flex gap-3 px-5 py-3">
            {Icon && (
              <span className={cx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', item.toneClass ?? 'bg-slate-100 text-slate-500')}>
                <Icon className="size-4" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{item.title}</p>
              {item.description && <p className="line-clamp-2 text-sm text-slate-500">{item.description}</p>}
              {item.at && <p className="mt-0.5 text-xs text-slate-400"><time dateTime={new Date(item.at).toISOString()}>{timeAgo(item.at)}</time></p>}
            </div>
            {item.aside}
          </div>
        )
        return (
          <li key={item.id ?? i} className="stagger animate-fade-up" style={{ '--i': i }}>
            {item.to ? <Link to={item.to} className="block transition hover:bg-slate-50">{body}</Link> : body}
          </li>
        )
      })}
    </ol>
  )
}

const DAY = 86_400_000

/** "in 3 days", "today", "2 days ago" relative to now. */
export const countdown = (date, now = Date.now()) => {
  const ms = new Date(date).getTime() - now
  const days = Math.round(ms / DAY)
  if (Math.abs(ms) < DAY && new Date(date).toDateString() === new Date(now).toDateString()) return ms >= 0 ? 'Today' : 'Earlier today'
  if (ms > 0) {
    if (ms < DAY) return `In ${Math.max(1, Math.round(ms / 3_600_000))} h`
    return days === 1 ? 'Tomorrow' : `In ${days} days`
  }
  return days === -1 || days === 0 ? 'Yesterday' : `${-days} days ago`
}

/**
 * Upcoming dates with countdowns; past dates are dimmed. items: [{ label, date, description?, withTime? }]
 * `urgentWithinDays` highlights anything close.
 */
export function KeyDates({ items, urgentWithinDays = 7, empty = 'No upcoming dates' }) {
  const [now] = useState(() => Date.now())
  const dated = items.filter((i) => i.date).sort((a, b) => new Date(a.date) - new Date(b.date))
  if (!dated.length) return <EmptyState compact title={empty} icon={CalendarClock} />
  return (
    <ol className="divide-y divide-slate-100">
      {dated.map((item) => {
        const t = new Date(item.date).getTime()
        const past = t < now
        const urgent = !past && t - now < urgentWithinDays * DAY
        const d = new Date(item.date)
        return (
          <li key={`${item.label}-${item.date}`} className={cx('flex items-center gap-4 px-5 py-3', past && 'opacity-60')}>
            <div className={cx('flex w-12 shrink-0 flex-col items-center rounded-lg py-1.5 ring-1', urgent ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200')}>
              <span className={cx('text-[10px] font-semibold uppercase', urgent ? 'text-amber-700' : 'text-slate-500')}>{d.toLocaleDateString(undefined, { month: 'short' })}</span>
              <span className="text-lg leading-none font-semibold tabular-nums">{d.getDate()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-500">{item.withTime ? formatDateTime(item.date) : formatDate(item.date)}{item.description ? ` · ${item.description}` : ''}</p>
            </div>
            <span className={cx('shrink-0 text-xs font-medium', past ? 'text-slate-400' : urgent ? 'text-amber-700' : 'text-slate-500')}>
              {past ? 'Passed' : countdown(item.date, now)}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * A card for a chart or list backed by a query: skeleton while loading, a friendly error with retry,
 * an empty state when `isEmpty(data)`, otherwise `children(data)`.
 */
export function DataCard({ title, subtitle, action, icon, query, isEmpty, emptyTitle = 'No data yet', emptyHint, emptyIcon, fallback, children, bodyClassName }) {
  let body
  if (query.isPending) body = fallback ?? <SkeletonChart />
  else if (query.isError) body = <ErrorState error={query.error} onRetry={() => query.refetch()} />
  else if (isEmpty?.(query.data)) body = <EmptyState compact title={emptyTitle} icon={emptyIcon}>{emptyHint}</EmptyState>
  else body = <div className={bodyClassName}>{children(query.data)}</div>
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} subtitle={subtitle} action={action} icon={icon} />
      <div className="flex-1">{body}</div>
    </Card>
  )
}

export function CardLink({ to, children = 'View all' }) {
  return (
    <Link to={to} className="inline-flex items-center gap-0.5 text-sm font-medium whitespace-nowrap text-brand-600 hover:text-brand-700">
      {children} <ChevronRight className="size-4" aria-hidden />
    </Link>
  )
}

/** Search box plus filters in one responsive row. */
export function FilterBar({ children, summary, onClear }) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">{children}</div>
      {summary && (
        <div className="mt-3 flex items-center justify-between text-sm text-slate-500" aria-live="polite">
          <span>{summary}</span>
          {onClear && <button type="button" onClick={onClear} className="font-medium text-brand-600 hover:text-brand-700">Clear filters</button>}
        </div>
      )}
    </Card>
  )
}

/** Animated check for completed actions. */
export function SuccessState({ title, children, actions }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center" role="status">
      <svg viewBox="0 0 52 52" className="size-16 animate-check-circle" aria-hidden>
        <circle cx="26" cy="26" r="25" fill="#dcfce7" />
        <path d="M15 27l7 7 15-16" fill="none" stroke="#16a34a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="40" className="animate-check-draw" />
      </svg>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      {children && <div className="mt-2 max-w-md text-sm text-slate-600">{children}</div>}
      {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}
