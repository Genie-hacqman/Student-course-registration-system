import { CalendarDays, CalendarRange } from 'lucide-react'
import { useCurrentRegistration, useSemesterList } from '../../api/student'
import { Card, CardHeader, EmptyState, PageHeader, QueryState, SkeletonList, SkeletonTable, StatusBadge } from '../../components/ui'
import { KeyDates } from '../../components/dashboard/Widgets'
import { MonthCalendar } from '../../components/dashboard/MonthCalendar'
import { semesterDates } from '../../lib/academic'
import { formatDate } from '../../lib/format'

const TONES = {
  'Registration opens': 'green', 'Your registration opens': 'green', 'Registration deadline': 'red',
  'Add/drop deadline': 'amber', 'Classes begin': 'brand', 'Semester ends': 'brand',
}

const SEMESTER_STATUS = { upcoming: ['pending', 'Upcoming'], active: ['active', 'In progress'], completed: ['completed', 'Completed'] }

export default function AcademicCalendar() {
  const current = useCurrentRegistration()
  const semesters = useSemesterList()
  const semester = current.data?.semester
  const record = semesters.data?.find((s) => s.id === semester?.id)
  const dates = semesterDates(semester, record)

  return (
    <div className="space-y-6">
      <PageHeader title="Academic Calendar" subtitle={semester ? `Key dates for ${semester.name}` : 'Key academic dates'} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Calendar" icon={CalendarDays} />
          {current.isPending || semesters.isPending
            ? <SkeletonList rows={5} />
            : <MonthCalendar events={dates.map((d) => ({ ...d, tone: TONES[d.label] }))} initialDate={dates.find((d) => new Date(d.date) >= new Date())?.date} />}
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="This semester" icon={CalendarRange} />
          <QueryState query={current} fallback={<SkeletonList rows={4} />}>{() => <KeyDates items={dates} />}</QueryState>
        </Card>
      </div>
      <Card>
        <CardHeader title="All semesters" />
        <QueryState query={semesters} fallback={<SkeletonTable rows={3} />}>
          {(rows) => (rows.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-sm">
                <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Semester</th>
                    <th scope="col" className="py-3 font-medium">Classes</th>
                    <th scope="col" className="py-3 font-medium">Registration</th>
                    <th scope="col" className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {[...rows].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate))).map((s) => {
                    const [status, label] = SEMESTER_STATUS[s.status] ?? ['draft', s.status]
                    return (
                      <tr key={s.id} className={s.isCurrent ? 'bg-brand-50/40' : 'hover:bg-slate-50'}>
                        <td className="px-5 py-3 font-medium">{s.name}{s.academicYear && <span className="block text-xs font-normal text-slate-500">{s.academicYear.name}</span>}</td>
                        <td className="py-3 text-slate-600">{formatDate(s.startDate)} – {formatDate(s.endDate)}</td>
                        <td className="py-3 text-slate-600">{formatDate(s.registrationStart)} – {formatDate(s.registrationEnd)}</td>
                        <td className="px-5 py-3"><StatusBadge status={status} label={s.isCurrent ? 'Current' : label} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No semesters published yet" icon={CalendarRange} />)}
        </QueryState>
      </Card>
    </div>
  )
}
