import { AlertTriangle } from 'lucide-react'
import { DAY_NAMES, formatTime } from '../../lib/format'

/** A 409 whose details list clashing classes: `[{ type: 'ROOM' | 'LECTURER', day, startTime, endTime, room, course }]`. */
export const isClash = (err) => err?.status === 409 && Array.isArray(err.details) && err.details.some((d) => d?.day)

export default function ClashList({ error }) {
  if (!error) return null
  return (
    <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
      <p className="flex items-center gap-2 font-medium"><AlertTriangle className="size-4" /> {error.message}</p>
      <ul className="mt-2 space-y-1 pl-6">
        {error.details.map((d, i) => (
          <li key={i} className="list-disc">
            <span className="font-medium">{d.course}</span>
            {' '}{DAY_NAMES[d.day]} {formatTime(d.startTime)}–{formatTime(d.endTime)}
            {d.type === 'ROOM' ? ` is already in ${d.room}` : ' is taught by the same lecturer'}
          </li>
        ))}
      </ul>
    </div>
  )
}
