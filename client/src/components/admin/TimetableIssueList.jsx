import { AlertTriangle } from 'lucide-react'
import { Badge } from '../ui'

export const ISSUE_TYPES = {
  STUDENT: { label: 'Student clash', tone: 'red' },
  LECTURER: { label: 'Lecturer double-booked', tone: 'red' },
  ROOM: { label: 'Room double-booked', tone: 'red' },
  UNSCHEDULED: { label: 'No class time / room', tone: 'amber' },
}

/**
 * Issues found while confirming a timetable on approval: rows from GET /admin/timetable-issues, or the
 * `details` of a 409 TIMETABLE_CONFLICT (`[{ courseCode, type, details: [{ message }] }]`).
 */
export default function TimetableIssueList({ issues }) {
  return (
    <ul className="space-y-3">
      {issues.map((issue, i) => (
        <li key={issue.id ?? `${issue.courseSectionId}-${issue.type}-${i}`} className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
          <div className="space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
              {issue.courseCode ?? issue.section?.course?.code}
              <Badge tone={ISSUE_TYPES[issue.type]?.tone}>{ISSUE_TYPES[issue.type]?.label ?? issue.type}</Badge>
            </p>
            {(issue.details ?? []).map((d, j) => <p key={j} className="text-sm text-slate-600">{d.message}</p>)}
          </div>
        </li>
      ))}
    </ul>
  )
}
