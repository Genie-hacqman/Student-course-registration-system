import { Clock, MapPin, UserRound } from 'lucide-react'
import { Badge, Button } from './ui'
import { RuleList } from './RegistrationActions'
import { DAY_NAMES, SECTION_STATUS, formatTime, lecturerName } from '../lib/format'

export function ScheduleList({ schedules }) {
  if (!schedules?.length) return <p className="text-sm text-slate-500">Schedule to be announced</p>
  return (
    <ul className="space-y-1">
      {schedules.map((s) => (
        <li key={s.id ?? `${s.day}-${s.startTime}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-600">
          <span className="w-24 font-medium text-slate-800">{DAY_NAMES[s.day]}</span>
          <span className="inline-flex items-center gap-1"><Clock className="size-3.5" /> {formatTime(s.startTime)} – {formatTime(s.endTime)}</span>
          {s.room && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {s.room}</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * One section with its live status. `status`/`reasons` come from /registrations/available-courses,
 * which runs the same rules the add endpoint enforces.
 */
export function SectionRow({ section, actions, showReasons = true }) {
  const status = SECTION_STATUS[section.status]
  const available = section.seatsAvailable ?? Math.max(section.capacity - section.seatsTaken, 0)
  const actionable = section.status === 'eligible' || section.status === 'full'
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">Section {section.sectionCode}</span>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
        </div>
        <span className="text-sm text-slate-600">
          Capacity <span className="font-medium text-slate-900">{section.seatsTaken} / {section.capacity}</span>
          <span className="text-slate-400"> · {available} left</span>
        </span>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-slate-600">
        <UserRound className="size-3.5" /> {lecturerName(section.lecturer)}
      </p>
      <ScheduleList schedules={section.schedules} />
      {showReasons && section.status === 'blocked' && section.reasons?.length > 0 && (
        <div className="rounded-md bg-amber-50/60 p-3"><RuleList failures={section.reasons} /></div>
      )}
      {section.notes?.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-slate-500">
          {section.notes.map((n) => <li key={n.message}>{n.message}</li>)}
        </ul>
      )}
      {actionable && actions && <div className="flex justify-end">{actions(section)}</div>}
    </div>
  )
}

/** Add button for eligible sections, waitlist for full ones (when offered). */
export function SectionActionButton({ section, onAdd, onWaitlist, pendingId, onWaitlistIds }) {
  const busy = pendingId === section.id
  if (section.status === 'eligible') {
    return <Button size="sm" loading={busy} onClick={() => onAdd(section.id)}>Add course</Button>
  }
  if (section.status === 'full' && section.waitlistOffered) {
    if (onWaitlistIds?.has(section.id)) return <Badge tone="amber">On waitlist</Badge>
    return <Button size="sm" variant="secondary" loading={busy} onClick={() => onWaitlist(section.id)}>Join waitlist</Button>
  }
  return null
}
