import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button, cx } from '../ui'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

export function MonthCalendar({ events, initialDate }) {
  const [cursor, setCursor] = useState(() => {
    const d = initialDate ? new Date(initialDate) : new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [today] = useState(() => new Date())
  const byDay = useMemo(() => {
    const map = new Map()
    for (const e of events) {
      const k = dayKey(new Date(e.date))
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return map
  }, [events])

  const first = cursor
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
  const cells = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(first.getFullYear(), first.getMonth(), i + 1))]
  const monthEvents = events
    .filter((e) => { const d = new Date(e.date); return d.getMonth() === first.getMonth() && d.getFullYear() === first.getFullYear() })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
  const move = (n) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const dot = { brand: 'bg-brand-600', amber: 'bg-amber-500', green: 'bg-green-600', red: 'bg-red-500' }

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3">
        <h3 className="font-semibold" aria-live="polite">{title}</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}>Today</Button>
          <Button size="sm" variant="ghost" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px border-y border-slate-100 bg-slate-100 text-center text-xs" role="grid" aria-label={title}>
        {WEEKDAYS.map((d) => <div key={d} role="columnheader" className="bg-slate-50 py-2 font-medium text-slate-500">{d}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`blank-${i}`} className="bg-white" />
          const items = byDay.get(dayKey(d)) ?? []
          const isToday = dayKey(d) === dayKey(today)
          return (
            <div
              key={d.getDate()}
              role="gridcell"
              aria-label={`${d.toLocaleDateString(undefined, { dateStyle: 'full' })}${items.length ? `: ${items.map((e) => e.label).join(', ')}` : ''}`}
              className={cx('flex min-h-12 flex-col items-center gap-1 bg-white py-1.5 sm:min-h-16', items.length && 'bg-brand-50/40')}
            >
              <span className={cx('flex size-6 items-center justify-center rounded-full tabular-nums', isToday ? 'bg-brand-600 font-semibold text-white' : 'text-slate-700')}>{d.getDate()}</span>
              <span className="flex gap-0.5">{items.slice(0, 3).map((e) => <span key={e.label} className={cx('size-1.5 rounded-full', dot[e.tone ?? 'brand'])} aria-hidden />)}</span>
            </div>
          )
        })}
      </div>
      <ul className="divide-y divide-slate-100">
        {monthEvents.length ? monthEvents.map((e) => (
          <li key={`${e.label}-${e.date}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <span className={cx('size-2 shrink-0 rounded-full', dot[e.tone ?? 'brand'])} aria-hidden />
            <span className="w-24 shrink-0 text-slate-500 tabular-nums">{new Date(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            <span className="font-medium text-slate-800">{e.label}</span>
          </li>
        )) : <li className="px-5 py-4 text-center text-sm text-slate-500">No academic dates this month.</li>}
      </ul>
    </div>
  )
}
