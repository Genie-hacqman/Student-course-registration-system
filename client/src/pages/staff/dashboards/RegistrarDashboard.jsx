import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, BarChart3, CalendarClock, CheckCircle2, ClipboardCheck, Clock, GraduationCap, Layers, Megaphone, UserX,
  Users,
} from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider'
import { useCoursePopularity, useOverview, useRegistrations } from '../../../api/staff'
import {
  Button, Card, CardHeader, EmptyState, ErrorState, ProgressBar, Skeleton, SkeletonChart, SkeletonList, StatusBadge,
} from '../../../components/ui'
import { StatCard, StatGrid } from '../../../components/dashboard/StatCard'
import { CardLink, DataCard, QuickActions, WelcomeHeader, countdown } from '../../../components/dashboard/Widgets'
import { BarBreakdown, DonutChart, FillRateChart } from '../../../components/charts/Charts'
import { SemesterSelect, useSemesterParam } from '../../../components/staff'
import { PERMS, can } from '../../../lib/roles'
import { formatDateTime, fullName, timeAgo } from '../../../lib/format'
import { registrationSlices } from './shared'

function DeadlineBanner({ semester }) {
  const [now] = useState(() => Date.now())
  if (!semester) return <Skeleton className="h-20 w-full rounded-xl" />
  const start = new Date(semester.registrationStart).getTime()
  const end = new Date(semester.registrationEnd).getTime()
  const open = now >= start && now <= end
  const upcoming = now < start
  return (
    <Card className="flex animate-fade-up flex-col gap-4 p-5 sm:flex-row sm:items-center">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${open ? 'bg-green-50 text-green-700' : upcoming ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
        <CalendarClock className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">{semester.academicYear?.name ? `Academic year ${semester.academicYear.name} · ` : ''}{semester.isCurrent ? 'Active semester' : 'Selected semester'}</p>
        <p className="text-lg font-semibold">{semester.name}</p>
      </div>
      <div className="sm:text-right">
        <StatusBadge status={open ? 'open' : upcoming ? 'pending' : 'closed'} label={open ? 'Registration open' : upcoming ? 'Opens soon' : 'Registration closed'} />
        <p className="mt-1 text-sm text-slate-600">
          {open ? <>Closes <span className="font-semibold text-slate-900">{countdown(semester.registrationEnd).toLowerCase()}</span> · {formatDateTime(semester.registrationEnd)}</>
            : upcoming ? <>Opens {formatDateTime(semester.registrationStart)}</>
              : <>Closed {formatDateTime(semester.registrationEnd)}</>}
        </p>
      </div>
    </Card>
  )
}

function StatusAtAGlance({ overview }) {
  if (overview.isPending) return <Card><SkeletonChart height={240} /></Card>
  if (overview.isError) return <Card><ErrorState title="Unable to load registration data" error={overview.error} onRetry={() => overview.refetch()} /></Card>
  const { registrations: r, totals } = overview.data
  const rows = [
    { label: 'Registered', value: r.byStatus.approved, icon: CheckCircle2, cls: 'text-green-700', to: 'approved' },
    { label: 'Pending approval', value: r.byStatus.submitted, icon: Clock, cls: 'text-amber-700', to: 'submitted' },
    { label: 'Not registered', value: r.notRegistered, icon: UserX, cls: 'text-red-700', hint: `${r.byStatus.draft} in progress · ${r.byStatus.rejected} need changes · ${r.notStarted} not started` },
  ]
  return (
    <Card className="animate-fade-up">
      <CardHeader title="Registration status" subtitle={`${totals.activeStudents.toLocaleString()} active student${totals.activeStudents === 1 ? '' : 's'}`} icon={ClipboardCheck} />
      <div className="grid gap-6 p-5 md:grid-cols-2 md:items-center">
        <ul className="divide-y divide-slate-100">
          {rows.map(({ label, value, icon: Icon, cls, to, hint }) => {
            const body = (
              <>
                <Icon className={`size-5 shrink-0 ${cls}`} aria-hidden />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-slate-700">{label}</span>
                  {hint && <span className="block text-xs text-slate-500">{hint}</span>}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{value.toLocaleString()}</span>
              </>
            )
            return (
              <li key={label}>
                {to
                  ? <Link to={`/staff/registrations?status=${to}`} className="flex items-center gap-3 rounded-lg px-2 py-3 transition hover:bg-slate-50">{body}</Link>
                  : <div className="flex items-center gap-3 px-2 py-3">{body}</div>}
              </li>
            )
          })}
        </ul>
        <DonutChart data={registrationSlices(r)} centerValue={`${Math.round(r.completionRate)}%`} centerLabel="complete" />
      </div>
      <div className="border-t border-slate-100 px-5 py-3">
        <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">Completion</span><span className="text-slate-500 tabular-nums">{r.byStatus.approved} / {totals.activeStudents}</span></div>
        <ProgressBar value={r.byStatus.approved} max={totals.activeStudents} tone="green" label="Registration completion" />
      </div>
    </Card>
  )
}

function RegistrationQueue({ title, subtitle, status, semesterId, empty, action }) {
  const list = useRegistrations({ status, semesterId, limit: 6 })
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} subtitle={subtitle} action={action} />
      {list.isPending ? <SkeletonList rows={4} /> : list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : list.data.items.length ? (
        <ul className="divide-y divide-slate-100">
          {list.data.items.map((r, i) => (
            <li key={r.id} className="stagger animate-fade-up" style={{ '--i': i }}>
              <Link to={`/staff/registrations/${r.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{fullName(r.student?.user)}</span>
                  <span className="block text-xs text-slate-500">{r.student?.studentNumber} · Level {r.student?.level} · {r.totalCredits} credits</span>
                </span>
                <span className="hidden text-xs text-slate-400 sm:block">{r.submittedAt ? timeAgo(r.submittedAt) : '—'}</span>
                {status === 'submitted' ? <Button size="sm" variant="secondary" tabIndex={-1}>Review</Button> : <StatusBadge status={r.status} />}
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title={empty} icon={CheckCircle2} />}
    </Card>
  )
}

function NeedsAttention({ semesterId, reports }) {
  const rejected = useRegistrations({ status: 'rejected', semesterId, limit: 4 })
  const popularity = useCoursePopularity(semesterId, { enabled: reports && Boolean(semesterId) })
  const crowded = (popularity.data?.sections ?? []).filter((s) => s.fillRate >= 100 || s.waitlisted > 0).slice(0, 4)
  const loading = rejected.isPending || (reports && popularity.isPending)
  const items = [
    ...(rejected.data?.items ?? []).map((r) => ({
      key: `r${r.id}`, to: `/staff/registrations/${r.id}`, icon: UserX, tone: 'text-red-600',
      title: fullName(r.student?.user), text: `Registration needs changes${r.remarks ? `: ${r.remarks}` : ''}`,
    })),
    ...crowded.map((s) => ({
      key: `s${s.sectionId}`, to: `/staff/sections/${s.sectionId}`, icon: AlertTriangle, tone: 'text-amber-600',
      title: `${s.code} · Section ${s.sectionCode}`, text: `${s.seatsTaken}/${s.capacity} seats${s.waitlisted ? ` · ${s.waitlisted} on waitlist` : ' · full'}`,
    })),
  ]
  return (
    <Card>
      <CardHeader title="Requires attention" subtitle="Students whose registration was returned, and full sections" icon={AlertTriangle} />
      {loading ? <SkeletonList rows={3} /> : items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map(({ key, to, icon: Icon, tone, title, text }) => (
            <li key={key}>
              <Link to={to} className="flex gap-3 px-5 py-3 transition hover:bg-slate-50">
                <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-900">{title}</span>
                  <span className="block truncate text-xs text-slate-500">{text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <EmptyState compact title="Nothing needs attention" icon={CheckCircle2} />}
    </Card>
  )
}

export default function RegistrarDashboard() {
  const { user } = useAuth()
  const { semesterId, setSemesterId, semesters, semester } = useSemesterParam()
  const reports = can(user, PERMS.REPORT_VIEW)
  const overview = useOverview(semesterId, { enabled: reports && Boolean(semesterId) })
  const popularity = useCoursePopularity(semesterId, { enabled: reports && Boolean(semesterId) })
  const o = overview.data
  const pendingCount = useRegistrations({ status: 'submitted', semesterId, limit: 1 }).data?.meta.total

  const quick = [
    { to: `/staff/registrations?status=submitted${semesterId ? `&semester=${semesterId}` : ''}`, label: 'Review pending registrations', description: pendingCount !== undefined ? `${pendingCount} waiting` : undefined, icon: ClipboardCheck },
    reports && { to: `/staff/reports${semesterId ? `?semester=${semesterId}` : ''}`, label: 'Registration reports', description: 'Status, fill rate, popularity', icon: BarChart3 },
    can(user, PERMS.SECTION_MANAGE) && { to: '/staff/sections', label: 'Course offerings', description: 'Sections, capacity, timetable', icon: Layers },
    can(user, PERMS.PREREQ_OVERRIDE) && { to: '/staff/students', label: 'Student records', description: 'Profiles, results, waivers', icon: GraduationCap },
    can(user, PERMS.ANNOUNCEMENT_CREATE) && { to: '/staff/announcements', label: 'Post an announcement', description: 'Reach students and staff', icon: Megaphone },
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={user?.firstName}
        subtitle="Registration progress and the approvals waiting for you."
        actions={<SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />}
      />
      <DeadlineBanner semester={semester} />

      {reports && (
        <StatGrid>
          <StatCard index={0} label="Active students" icon={Users} value={o?.totals.activeStudents} hint={o && `${o.totals.students} on record`} />
          <StatCard index={1} label="Registered" icon={CheckCircle2} tone="green" value={o?.registrations.byStatus.approved} hint="Approved registrations" to="/staff/registrations?status=approved" />
          <StatCard index={2} label="Pending approval" icon={Clock} tone="amber" value={o?.registrations.byStatus.submitted} hint="Waiting for review" to="/staff/registrations?status=submitted" />
          <StatCard index={3} label="Not registered" icon={UserX} tone="red" value={o?.registrations.notRegistered} hint={o && `${o.registrations.completionRate}% complete`} />
        </StatGrid>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          {reports ? <StatusAtAGlance overview={overview} /> : (
            <RegistrationQueue title="Pending approvals" status="submitted" semesterId={semesterId} empty="No pending registrations" />
          )}
        </div>
        <div className="min-w-0 lg:col-span-2">
          <RegistrationQueue
            title="Pending approvals"
            subtitle="Oldest first"
            status="submitted"
            semesterId={semesterId}
            empty="No pending registrations"
            action={<CardLink to={`/staff/registrations?status=submitted${semesterId ? `&semester=${semesterId}` : ''}`}>All</CardLink>}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <RegistrationQueue title="Recent registrations" status="" semesterId={semesterId} empty="No registrations yet" action={<CardLink to="/staff/registrations?status=">All</CardLink>} />
        <NeedsAttention semesterId={semesterId} reports={reports} />
        <QuickActions items={quick} columns="grid-cols-1" />
      </div>

      {reports && (
        <div className="grid gap-6 lg:grid-cols-2">
          <DataCard title="Students by programme" subtitle="Active students" query={overview} isEmpty={(d) => !d.studentsByProgram.length} bodyClassName="p-4">
            {(d) => <BarBreakdown data={d.studentsByProgram.map((p) => ({ label: p.code, value: p.count }))} valueLabel="Active students" multicolor />}
          </DataCard>
          <DataCard
            title="Course registration"
            subtitle="Fullest course offerings"
            query={popularity}
            isEmpty={(d) => !d.sections.length}
            emptyTitle="No course offerings this semester"
            bodyClassName="p-4"
            action={<CardLink to={`/staff/reports${semesterId ? `?semester=${semesterId}` : ''}`}>Reports</CardLink>}
          >
            {(d) => <FillRateChart sections={d.sections} limit={8} />}
          </DataCard>
        </div>
      )}
    </div>
  )
}
