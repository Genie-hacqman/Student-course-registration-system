import { Suspense, lazy, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award, BookOpen, BookOpenCheck, CalendarClock, CalendarDays, ClipboardList, Download, GraduationCap, Layers, Library,
  TrendingUp, UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../auth/AuthProvider'
import { downloadSlip, useCurrentRegistration, useResults, useSemesterList } from '../../api/student'
import { useMyAttendance } from '../../api/attendance'
import { useNotifications } from '../../api/notifications'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, SkeletonChart, SkeletonList, StatusBadge,
} from '../../components/ui'
import { StatCard, StatGrid } from '../../components/dashboard/StatCard'
import { CardLink, KeyDates, MetaChip, QuickActions, WelcomeHeader } from '../../components/dashboard/Widgets'
import { CATEGORIES, NotificationItem, categoryOf } from '../../components/dashboard/NotificationItems'
import { gpaBySemester, semesterDates, upcoming } from '../../lib/academic'
import { lecturerName, windowState } from '../../lib/format'

const GpaTrend = lazy(() => import('../../components/charts/GpaTrend'))

function RegistrationProgress({ current }) {
  if (current.isPending) return <Card className="space-y-4 p-5"><Skeleton className="h-5 w-48" /><Skeleton className="h-3 w-full" /><Skeleton className="h-16 w-full" /></Card>
  if (current.isError) return <Card><ErrorState title="Unable to load registration data" error={current.error} onRetry={() => current.refetch()} /></Card>

  const { semester, registration } = current.data
  const credits = registration?.totalCredits ?? 0
  const courses = registration?.items?.length ?? 0
  const pct = semester.maxCredits ? Math.round((credits / semester.maxCredits) * 100) : 0
  const belowMin = credits < semester.minCredits
  const status = registration?.status
  const cta = !registration || ['draft', 'rejected'].includes(status)
    ? { to: '/student/registration', label: courses ? 'Continue registration' : 'Start registration' }
    : { to: '/student/my-courses', label: 'View my courses' }

  return (
    <Card className="animate-fade-up">
      <CardHeader
        title="Registration progress"
        subtitle={semester.name}
        icon={ClipboardList}
        action={status ? <StatusBadge status={status} /> : <StatusBadge status="not_started" />}
      />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <p className="text-4xl font-semibold tracking-tight tabular-nums">{pct}%</p>
          <p className="text-sm text-slate-500" aria-live="polite">
            <span className="font-medium text-slate-900">{credits}</span> of {semester.maxCredits} credits registered
          </p>
        </div>
        <ProgressBar value={credits} max={semester.maxCredits} size="lg" tone={belowMin ? 'amber' : 'brand'} label="Credits registered" />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Courses registered', courses],
            ['Credits registered', credits],
            ['Credits available', Math.max(0, semester.maxCredits - credits)],
            ['Needed for minimum', Math.max(0, semester.minCredits - credits)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {registration?.remarks && status === 'rejected' && (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><span className="font-medium">Reviewer remarks:</span> {registration.remarks}</p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            {belowMin
              ? `Register at least ${semester.minCredits} credits to submit.`
              : `Between ${semester.minCredits} and ${semester.maxCredits} credits are allowed.`}
          </p>
          <Link to={cta.to}><Button>{cta.label}</Button></Link>
        </div>
      </div>
    </Card>
  )
}

function CurrentCourses({ current }) {
  const items = current.data?.registration?.items ?? []
  const status = current.data?.registration?.status
  return (
    <Card className="flex flex-col">
      <CardHeader title="Current courses" icon={BookOpenCheck} action={items.length > 0 && <CardLink to="/student/my-courses">My courses</CardLink>} />
      {current.isPending ? <SkeletonList rows={3} /> : current.isError ? (
        <ErrorState error={current.error} onRetry={() => current.refetch()} />
      ) : items.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-140 text-sm">
            <caption className="sr-only">Courses registered this semester</caption>
            <thead className="border-b border-slate-100 text-left text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Course</th>
                <th scope="col" className="py-2.5 font-medium">Credits</th>
                <th scope="col" className="py-2.5 font-medium">Lecturer</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-slate-900">{item.section.course.code}</p>
                    <p className="text-slate-500">{item.section.course.title}</p>
                  </td>
                  <td className="py-3 tabular-nums">{item.credits}</td>
                  <td className="py-3 text-slate-600">{lecturerName(item.section.lecturer)}</td>
                  <td className="px-5 py-3"><StatusBadge status={status === 'approved' ? 'registered' : status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState compact title="No courses registered yet" icon={BookOpen} action={<Link to="/student/registration"><Button size="sm">Register courses</Button></Link>}>
          Courses you register for this semester will appear here.
        </EmptyState>
      )}
    </Card>
  )
}

function DashboardNotifications() {
  const list = useNotifications({ page: 1, limit: 5 })
  const [filter, setFilter] = useState('all')
  const items = (list.data?.items ?? []).filter((n) => filter === 'all' || categoryOf(n.type) === filter)
  return (
    <Card className="flex flex-col">
      <CardHeader title="Notifications" action={<CardLink to="/student/notifications" />} />
      <div className="flex gap-1.5 overflow-x-auto px-5 pt-3" role="group" aria-label="Filter notifications">
        {[['all', 'All'], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])].map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition ${filter === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {list.isPending ? <SkeletonList rows={3} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : items.length ? (
        <ul className="mt-2 divide-y divide-slate-100">{items.map((n) => <li key={n.id}><NotificationItem n={n} compact /></li>)}</ul>
      ) : <EmptyState compact title="No notifications" />}
    </Card>
  )
}

function AcademicOverview({ results, attendance }) {
  const { user } = useAuth()
  const s = user?.student
  const summary = results.data?.summary
  const completed = results.data?.results.filter((r) => r.passed).length
  const rated = attendance.data?.filter((a) => a.rate !== null) ?? []
  const attendanceRate = rated.length ? Math.round(rated.reduce((n, a) => n + a.rate, 0) / rated.length) : null
  const trend = gpaBySemester(results.data?.results)
  const rows = [
    ['GPA', summary ? (summary.gpa ?? '—') : undefined],
    ['Credits earned', summary?.creditsEarned],
    ['Courses completed', completed],
    ['Attendance', attendance.isPending ? undefined : attendanceRate === null ? '—' : `${attendanceRate}%`],
    ['Level', s?.level],
    ['Programme', s?.program?.name],
    ['Student no.', s?.studentNumber],
  ]
  return (
    <Card>
      <CardHeader title="Academic overview" icon={GraduationCap} action={<CardLink to="/student/results">Results</CardLink>} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className={label === 'Programme' ? 'col-span-2' : ''}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="font-semibold text-slate-900">{value === undefined ? <Skeleton className="mt-1 h-4 w-12" /> : value}</dd>
          </div>
        ))}
      </dl>
      {trend.length >= 2 && (
        <div className="border-t border-slate-100 px-2 pt-3 pb-2">
          <p className="flex items-center gap-1.5 px-3 text-xs font-medium text-slate-500"><TrendingUp className="size-3.5" aria-hidden /> GPA by semester</p>
          <Suspense fallback={<SkeletonChart height={200} />}><GpaTrend data={trend} /></Suspense>
        </div>
      )}
    </Card>
  )
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const current = useCurrentRegistration()
  const results = useResults()
  const attendance = useMyAttendance()
  const semesters = useSemesterList()
  const [downloading, setDownloading] = useState(false)

  const semester = current.data?.semester
  const registration = current.data?.registration
  const record = semesters.data?.find((s) => s.id === semester?.id)
  const dates = semesterDates(semester, record)
  const win = windowState(semester, registration)
  const s = user?.student

  const slip = async () => {
    setDownloading(true)
    try { await downloadSlip(registration.id, registration.referenceNumber) } catch (err) { toast.error(err.message) } finally { setDownloading(false) }
  }

  const actions = [
    { to: '/student/registration', label: 'Register courses', description: 'Guided course registration', icon: ClipboardList },
    { to: '/student/results', label: 'View results', description: 'Grades and GPA', icon: Award },
    registration?.referenceNumber
      ? { label: downloading ? 'Preparing slip…' : 'Download registration slip', description: `Ref. ${registration.referenceNumber}`, icon: Download, onClick: slip }
      : { to: '/student/timetable', label: 'View timetable', description: 'Your weekly classes', icon: CalendarDays },
    { to: '/student/profile', label: 'View profile', description: 'Student record', icon: UserRound },
  ]

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={user?.firstName}
        subtitle="Here's an overview of your academic activity."
        meta={(
          <>
            {semester && <MetaChip icon={CalendarClock}>{semester.name}</MetaChip>}
            {s?.program && <MetaChip icon={Library}>{s.program.name}</MetaChip>}
            {s?.level && <MetaChip icon={Layers}>Level {s.level}</MetaChip>}
            {semester && <Badge tone={win.tone}>Registration: {win.label}</Badge>}
          </>
        )}
      />

      <StatGrid>
        <StatCard index={0} label="Current GPA" icon={Award} tone="violet" value={results.isPending ? undefined : (results.data?.summary.gpa ?? '—')} decimals={2}
          hint={results.data ? `${results.data.summary.creditsEarned} credits earned` : undefined} />
        <StatCard index={1} label="Registered credits" icon={TrendingUp} value={current.isPending ? undefined : (registration?.totalCredits ?? 0)}
          hint={semester ? `of ${semester.maxCredits} allowed` : undefined} />
        <StatCard index={2} label="Registered courses" icon={BookOpen} tone="green" value={current.isPending ? undefined : (registration?.items?.length ?? 0)}
          hint={semester?.name} to="/student/my-courses" />
        <StatCard index={3} label="Current level" icon={Layers} tone="amber" value={s?.level ?? '—'} hint={s?.program?.code ?? s?.program?.name} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><RegistrationProgress current={current} /></div>
        <Card>
          <CardHeader title="Upcoming deadlines" icon={CalendarClock} />
          {current.isPending ? <SkeletonList rows={3} /> : <KeyDates items={upcoming(dates)} empty="No upcoming deadlines" />}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2"><CurrentCourses current={current} /></div>
        <DashboardNotifications />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <AcademicOverview results={results} attendance={attendance} />
        <Card>
          <CardHeader title="Academic calendar" icon={CalendarDays} action={<CardLink to="/student/calendar">Full calendar</CardLink>} />
          {current.isPending ? <SkeletonList rows={4} /> : <KeyDates items={dates} />}
        </Card>
        <QuickActions items={actions} columns="grid-cols-1" />
      </div>
    </div>
  )
}
