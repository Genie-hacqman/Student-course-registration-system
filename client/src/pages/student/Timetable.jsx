import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import { useTimetable } from '../../api/student'
import { Badge, Card, EmptyState, PageHeader, QueryState } from '../../components/ui'
import WeekGrid from '../../components/WeekGrid'
import { DAY_NAMES, REGISTRATION_STATUS } from '../../lib/format'

export default function Timetable() {
  const timetable = useTimetable()
  return (
    <div>
      <PageHeader
        title="Timetable"
        subtitle={timetable.data && `${timetable.data.semester.name} · ${timetable.data.totalCredits} credits`}
        action={timetable.data?.registrationStatus && (
          <Badge tone={REGISTRATION_STATUS[timetable.data.registrationStatus]?.tone}>
            {REGISTRATION_STATUS[timetable.data.registrationStatus]?.label}
          </Badge>
        )}
      />
      <QueryState query={timetable}>
        {({ days, conflicts }) => (
          <div className="space-y-4">
            {conflicts.length > 0 && (
              <Card className="flex gap-3 bg-red-50 p-4 ring-red-200">
                <AlertTriangle className="size-5 shrink-0 text-red-600" />
                <div className="text-sm text-red-800">
                  <p className="font-medium">Timetable conflicts</p>
                  <ul className="mt-1 list-disc pl-5">
                    {conflicts.map((c) => <li key={`${c.day}-${c.courses.join()}`}>{c.courses.join(' and ')} overlap on {DAY_NAMES[c.day]}</li>)}
                  </ul>
                </div>
              </Card>
            )}
            <Card className="p-4">
              {days.length ? <WeekGrid days={days} conflicts={conflicts} /> : (
                <EmptyState title="Your timetable is empty" icon={CalendarDays}>
                  <Link to="/student/courses" className="font-medium text-brand-600">Add courses</Link> to see them here.
                </EmptyState>
              )}
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  )
}
