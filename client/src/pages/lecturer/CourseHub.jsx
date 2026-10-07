import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Mail, UsersRound } from 'lucide-react'
import { useMySections, useRoster } from '../../api/lecturer'
import { Card, CardHeader, EmptyState, ErrorState, Skeleton, SkeletonTable, StatusBadge, Tabs } from '../../components/ui'
import { AttendancePanel } from '../../components/teaching/AttendancePanel'
import { AssessmentsPanel } from '../../components/teaching/AssessmentsPanel'
import GradeSheet from '../../components/GradeSheet'
import { useAuth } from '../../auth/AuthProvider'
import { PERMS, can } from '../../lib/roles'
import { formatDate, fullName } from '../../lib/format'
import { timetableSummary } from '../admin/Sections'

function ClassList({ roster }) {
  const { students } = roster
  return (
    <Card>
      <CardHeader
        title="Class list"
        subtitle="Students still awaiting registration approval are included; only approved students can be graded."
        icon={UsersRound}
        action={students.length > 0 && (
          <a href={`mailto:?bcc=${students.map((s) => s.user?.email).filter(Boolean).join(',')}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            <Mail className="size-4" aria-hidden /> Email class
          </a>
        )}
      />
      {students.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Student</th>
                <th scope="col" className="py-3 font-medium">Student no.</th>
                <th scope="col" className="py-3 font-medium">Level</th>
                <th scope="col" className="py-3 font-medium">Registered</th>
                <th scope="col" className="px-5 py-3 font-medium">Registration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((s) => (
                <tr key={s.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-2.5"><span className="font-medium">{fullName(s.user)}</span><p className="text-xs text-slate-500">{s.user?.email}</p></td>
                  <td className="py-2.5 tabular-nums">{s.studentNumber}</td>
                  <td className="py-2.5">{s.level}</td>
                  <td className="py-2.5 text-slate-600">{formatDate(s.registeredAt)}</td>
                  <td className="px-5 py-2.5"><StatusBadge status={s.registrationStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No students yet" icon={UsersRound}>Students appear here as they register.</EmptyState>}
    </Card>
  )
}

export default function CourseHub() {
  const { id } = useParams()
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const roster = useRoster(id)
  const sections = useMySections()
  const section = sections.data?.find((s) => String(s.id) === id)

  const tabs = [
    { value: 'students', label: 'Students', count: roster.data?.students.length },
    can(user, PERMS.ATTENDANCE_RECORD) && { value: 'attendance', label: 'Attendance' },
    can(user, PERMS.ASSESSMENT_MANAGE) && { value: 'assessments', label: 'Assessments' },
    (can(user, PERMS.GRADE_ENTER) || can(user, PERMS.GRADE_MANAGE)) && { value: 'grades', label: 'Grades' },
  ].filter(Boolean)
  const tab = tabs.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'students'

  if (roster.isError) return <Card><ErrorState title="Unable to load this course" error={roster.error} onRetry={() => roster.refetch()} /></Card>

  return (
    <div className="space-y-6">
      <Link to="/lecturer/courses" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" aria-hidden /> My courses
      </Link>
      <Card className="p-6">
        {roster.isPending ? <div className="space-y-2"><Skeleton className="h-4 w-20" /><Skeleton className="h-7 w-72" /></div> : (
          <>
            <p className="text-sm font-semibold text-brand-700">{roster.data.section.course.code} · Section {roster.data.section.sectionCode}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{roster.data.section.course.title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {roster.data.students.length} registered · capacity {roster.data.section.capacity}
              {section && ` · ${section.semester?.name} · ${timetableSummary(section.schedules)}`}
            </p>
          </>
        )}
      </Card>

      <Tabs variant="underline" label="Course sections" items={tabs} value={tab} onChange={(v) => setParams(v === 'students' ? {} : { tab: v }, { replace: true })} />

      {roster.isPending ? <Card><SkeletonTable rows={5} /></Card> : (
        <>
          {tab === 'students' && <ClassList roster={roster.data} />}
          {tab === 'attendance' && (section ? <AttendancePanel section={section} /> : <Card><SkeletonTable /></Card>)}
          {tab === 'assessments' && (section ? <AssessmentsPanel section={section} /> : <Card><SkeletonTable /></Card>)}
          {tab === 'grades' && <GradeSheet sectionId={id} />}
        </>
      )}
    </div>
  )
}
