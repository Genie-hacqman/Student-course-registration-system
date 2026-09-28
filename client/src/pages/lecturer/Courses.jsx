import { Link } from 'react-router-dom'
import { BookOpen, ChevronRight } from 'lucide-react'
import { useMySections } from '../../api/lecturer'
import { Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar, QueryState, SkeletonTable } from '../../components/ui'
import { timetableSummary } from '../admin/Sections'

/** Sections grouped by semester, current semester first. */
const bySemester = (sections) => {
  const groups = new Map()
  sections.forEach((s) => {
    const key = s.semester?.id ?? 0
    if (!groups.has(key)) groups.set(key, { semester: s.semester, sections: [] })
    groups.get(key).sections.push(s)
  })
  return [...groups.values()].sort((a, b) => Number(b.semester?.isCurrent ?? 0) - Number(a.semester?.isCurrent ?? 0) || (b.semester?.id ?? 0) - (a.semester?.id ?? 0))
}

export default function LecturerCourses() {
  const sections = useMySections()
  return (
    <div className="space-y-6">
      <PageHeader title="My Courses" subtitle="Open a course for its class list, attendance, assessments and grades." />
      <QueryState query={sections} fallback={<Card><SkeletonTable rows={4} /></Card>} errorTitle="Unable to load your courses">
        {(rows) => (rows.length ? bySemester(rows).map(({ semester, sections: list }) => (
          <Card key={semester?.id ?? 'none'}>
            <CardHeader title={<>{semester?.name ?? 'No semester'} {semester?.isCurrent && <Badge tone="blue">Current</Badge>}</>} subtitle={`${list.length} course${list.length === 1 ? '' : 's'}`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="border-b border-slate-100 text-left text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">Course</th>
                    <th scope="col" className="py-2.5 font-medium">Level</th>
                    <th scope="col" className="py-2.5 font-medium">Schedule</th>
                    <th scope="col" className="w-48 py-2.5 font-medium">Students</th>
                    <th scope="col"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((s) => (
                    <tr key={s.id} className="group transition-colors hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <Link to={`/lecturer/courses/${s.id}`} className="font-semibold text-slate-900 group-hover:text-brand-700">{s.course.code}</Link>
                        <span className="text-slate-500"> · Section {s.sectionCode}</span>
                        <p className="text-slate-600">{s.course.title}</p>
                      </td>
                      <td className="py-3">{s.course.level}</td>
                      <td className="py-3 text-slate-600">{timetableSummary(s.schedules)}</td>
                      <td className="py-3 pr-4">
                        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{s.seatsTaken} enrolled</span><span className="tabular-nums">cap. {s.capacity}</span></div>
                        <ProgressBar value={s.seatsTaken} max={s.capacity} size="sm" label={`${s.course.code} enrolment`} />
                      </td>
                      <td className="pr-5 text-right"><Link to={`/lecturer/courses/${s.id}`} aria-label={`Open ${s.course.code}`}><ChevronRight className="size-5 text-slate-400 group-hover:text-slate-700" /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )) : (
          <Card><EmptyState title="No courses assigned yet" icon={BookOpen}>The registry assigns lecturers to course sections.</EmptyState></Card>
        ))}
      </QueryState>
    </div>
  )
}
