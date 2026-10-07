import { cx } from './ui'
import { DAY_NAMES, DAY_ORDER, formatTime, minutesOf } from '../lib/format'

const HOUR_PX = 56
const PALETTE = [
  'bg-blue-50 ring-blue-200 text-blue-900',
  'bg-emerald-50 ring-emerald-200 text-emerald-900',
  'bg-violet-50 ring-violet-200 text-violet-900',
  'bg-amber-50 ring-amber-200 text-amber-900',
  'bg-cyan-50 ring-cyan-200 text-cyan-900',
  'bg-rose-50 ring-rose-200 text-rose-900',
]

export default function WeekGrid({ days, conflicts }) {
  const all = days.flatMap((d) => d.classes)
  const startHour = Math.min(8, ...all.map((c) => Math.floor(minutesOf(c.startTime) / 60)))
  const endHour = Math.max(17, ...all.map((c) => Math.ceil(minutesOf(c.endTime) / 60)))
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
  const shownDays = DAY_ORDER.filter((d) => ['MON', 'TUE', 'WED', 'THU', 'FRI'].includes(d) || days.some((x) => x.day === d))
  const colors = new Map([...new Set(all.map((c) => c.course.code))].map((code, i) => [code, PALETTE[i % PALETTE.length]]))
  const clashing = (day, code) => conflicts.some((c) => c.day === day && c.courses.includes(code))

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `4rem repeat(${shownDays.length}, 1fr)` }}>
        <div />
        {shownDays.map((d) => (
          <div key={d} className="border-b border-slate-200 pb-2 text-center text-sm font-semibold">{DAY_NAMES[d]}</div>
        ))}
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h, i) => (
            <span key={h} className="absolute right-2 -translate-y-2 text-xs text-slate-400" style={{ top: i * HOUR_PX }}>
              {formatTime(`${h}:00`)}
            </span>
          ))}
        </div>
        {shownDays.map((d) => {
          const classes = days.find((x) => x.day === d)?.classes ?? []
          return (
            <div key={d} className="relative border-l border-slate-100" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h, i) => <div key={h} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * HOUR_PX }} />)}
              {classes.map((c) => {
                const top = ((minutesOf(c.startTime) - startHour * 60) / 60) * HOUR_PX
                const height = ((minutesOf(c.endTime) - minutesOf(c.startTime)) / 60) * HOUR_PX
                const clash = clashing(d, c.course.code)
                return (
                  <div
                    key={`${c.sectionId}-${c.startTime}`}
                    className={cx('absolute inset-x-1 overflow-hidden rounded-md p-1.5 text-xs ring-1', clash ? 'bg-red-50 text-red-900 ring-2 ring-red-400' : colors.get(c.course.code))}
                    style={{ top: top + 1, height: height - 2 }}
                    title={`${c.course.code} ${c.course.title}\n${formatTime(c.startTime)}–${formatTime(c.endTime)}${c.room ? `\n${c.room}` : ''}`}
                  >
                    <p className="font-semibold">{c.course.code}</p>
                    <p className="truncate">{formatTime(c.startTime)}–{formatTime(c.endTime)}</p>
                    {c.room && <p className="truncate opacity-80">{c.room}</p>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
