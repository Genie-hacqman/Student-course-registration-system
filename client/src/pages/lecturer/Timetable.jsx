import { CalendarDays } from 'lucide-react'
import { useLecturerTimetable } from '../../api/lecturer'
import { Card, EmptyState, PageHeader, QueryState, SkeletonChart } from '../../components/ui'
import WeekGrid from '../../components/WeekGrid'

export default function LecturerTimetable() {
  const timetable = useLecturerTimetable()
  return (
    <div>
      <PageHeader title="Timetable" subtitle={timetable.data?.semester?.name && `Your teaching week · ${timetable.data.semester.name}`} />
      <QueryState query={timetable} fallback={<Card><SkeletonChart height={320} /></Card>} errorTitle="Unable to load your timetable">
        {({ days, conflicts }) => (
          <Card className="p-4">
            {days.length ? <WeekGrid days={days} conflicts={conflicts} /> : <EmptyState title="No classes scheduled this semester" icon={CalendarDays} />}
          </Card>
        )}
      </QueryState>
    </div>
  )
}
