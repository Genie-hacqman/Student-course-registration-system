import { Link } from 'react-router-dom'
import {
  Activity, BookOpen, ClipboardCheck, FileSignature, GraduationCap, Library, PieChart, ScrollText, Settings, ShieldCheck, TrendingUp,
  UserCheck, Users, UsersRound,
} from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider'
import { useApi } from '../../../api/admin'
import { useOverview } from '../../../api/staff'
import { useNotifications } from '../../../api/notifications'
import { Card, CardHeader, EmptyState, ErrorState, SkeletonChart, SkeletonList } from '../../../components/ui'
import { StatCard, StatGrid } from '../../../components/dashboard/StatCard'
import { ActivityList, CardLink, DataCard, QuickActions, WelcomeHeader } from '../../../components/dashboard/Widgets'
import { NotificationItem } from '../../../components/dashboard/NotificationItems'
import { BarBreakdown, DonutChart, TrendLine } from '../../../components/charts/Charts'
import { SemesterSelect, useSemesterParam } from '../../../components/staff'
import { PERMS, ROLE_LABELS, can } from '../../../lib/roles'
import { fullName } from '../../../lib/format'
import { describeAction, registrationSlices, shortDate, usePendingActions } from './shared'

export default function AdminDashboard() {
  const { user } = useAuth()
  const { semesterId, setSemesterId, semesters, semester } = useSemesterParam()
  const reports = can(user, PERMS.REPORT_VIEW)
  const overview = useOverview(semesterId, { enabled: reports && Boolean(semesterId) })
  const audit = useApi(can(user, PERMS.AUDIT_VIEW) ? '/admin/audit-logs' : null, { limit: 8 })
  const notifications = useNotifications({ page: 1, limit: 5 })
  const pending = usePendingActions(user, semesterId)
  const applications = useApi(can(user, PERMS.APPLICATION_REVIEW) ? '/applications' : null, { status: 'submitted', limit: 1 })
  const o = overview.data

  const quick = [
    can(user, PERMS.USER_MANAGE) && { to: '/staff/users', label: 'Manage users', description: 'Accounts, roles and access', icon: Users },
    can(user, PERMS.COURSE_MANAGE) && { to: '/staff/programs', label: 'Academic structure', description: 'Programmes and courses', icon: Library },
    can(user, PERMS.ROLE_MANAGE) && { to: '/staff/roles', label: 'Roles & permissions', description: 'Who can do what', icon: ShieldCheck },
    can(user, PERMS.SETTINGS_MANAGE) && { to: '/staff/settings', label: 'System settings', description: 'Registration and grading rules', icon: Settings },
    can(user, PERMS.REPORT_VIEW) && { to: '/staff/reports', label: 'Reports', description: 'Registration and course data', icon: PieChart },
  ].filter(Boolean)

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={user?.firstName}
        subtitle="System overview: people, academic structure and registration activity."
        actions={<SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />}
      />

      {reports ? (
        overview.isError ? <Card><ErrorState title="Unable to load system statistics" error={overview.error} onRetry={() => overview.refetch()} /></Card> : (
          <StatGrid>
            <StatCard index={0} label="Total students" icon={GraduationCap} value={o?.totals.students} hint={o && `${o.totals.activeStudents} active`} to="/staff/students" />
            <StatCard index={1} label="Total lecturers" icon={UsersRound} tone="violet" value={o?.totals.lecturers} hint={o && `${o.totals.departments} departments`} />
            <StatCard index={2} label="Programmes" icon={Library} tone="slate" value={o?.totals.programs} to={can(user, PERMS.COURSE_MANAGE) ? '/staff/programs' : undefined} />
            <StatCard index={3} label="Courses" icon={BookOpen} tone="slate" value={o?.totals.courses} hint={o && `${o.totals.activeCourses} active · ${o.totals.sections} offerings this semester`} />
            <StatCard index={4} label="Active users" icon={Users} tone="green" value={o?.users.active} hint={o && `of ${o.users.total} accounts`} to={can(user, PERMS.USER_MANAGE) ? '/staff/users' : undefined} />
            <StatCard index={5} label="Pending approvals" icon={ClipboardCheck} tone="amber" value={pending.total} hint="Registrations and account requests" />
            <StatCard index={6} label="Registration completion" icon={TrendingUp} value={o?.registrations.completionRate} decimals={1} suffix="%" hint={semester?.name} />
            <StatCard index={7} label="System activity" icon={Activity} tone="slate" value={o ? (o.activityLast24h ?? '—') : undefined} hint="Audit events, last 24 hours" to={can(user, PERMS.AUDIT_VIEW) ? '/staff/audit-log' : undefined} />
            {can(user, PERMS.APPLICATION_REVIEW) && (
              <StatCard index={8} label="Admission applications" icon={FileSignature} tone="amber" value={applications.data?.meta?.total} hint="Waiting for review" to="/staff/applications" />
            )}
          </StatGrid>
        )
      ) : null}

      {reports && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">
            <DataCard
              title="Registration activity"
              subtitle="Registrations submitted per day this semester"
              icon={TrendingUp}
              query={overview}
              isEmpty={(d) => !d.registrationActivity.length}
              emptyTitle="No registrations submitted yet"
              bodyClassName="p-4"
            >
              {(d) => <TrendLine data={d.registrationActivity.map((r) => ({ label: shortDate(r.date), value: r.count }))} valueLabel="Submissions" />}
            </DataCard>
          </div>
          <DataCard title="Registration status" subtitle={semester?.name} query={overview} isEmpty={(d) => !d.totals.activeStudents} emptyTitle="No active students" bodyClassName="p-5" fallback={<SkeletonChart height={200} />}>
            {(d) => <DonutChart data={registrationSlices(d.registrations)} centerValue={`${Math.round(d.registrations.completionRate)}%`} centerLabel="registered" />}
          </DataCard>
        </div>
      )}

      {reports && (
        <div className="grid gap-6 lg:grid-cols-3">
          <DataCard title="Students by programme" query={overview} isEmpty={(d) => !d.studentsByProgram.length} emptyTitle="No programmes yet" bodyClassName="p-4">
            {(d) => <BarBreakdown data={d.studentsByProgram.map((p) => ({ label: p.code, value: p.count }))} valueLabel="Active students" multicolor />}
          </DataCard>
          <DataCard title="Students by level" query={overview} isEmpty={(d) => !d.studentsByLevel.length} emptyTitle="No active students" bodyClassName="p-4">
            {(d) => <BarBreakdown data={d.studentsByLevel.map((l) => ({ label: `Level ${l.level}`, value: l.count }))} valueLabel="Active students" />}
          </DataCard>
          <DataCard title="Users by role" query={overview} isEmpty={(d) => !d.users.total} bodyClassName="p-5" fallback={<SkeletonChart height={200} />}>
            {(d) => <DonutChart data={d.users.byRole.filter((r) => r.total).map((r) => ({ label: ROLE_LABELS[r.role] ?? r.role, value: r.total }))} centerLabel="accounts" />}
          </DataCard>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {can(user, PERMS.AUDIT_VIEW) && (
          <Card className="lg:col-span-2">
            <CardHeader title="Recent system activity" icon={ScrollText} action={<CardLink to="/staff/audit-log">Audit log</CardLink>} />
            {audit.isPending ? <SkeletonList rows={5} /> : audit.isError ? <ErrorState error={audit.error} onRetry={() => audit.refetch()} /> : (
              <ActivityList
                items={(audit.data?.items ?? []).map((l) => ({
                  id: l.id,
                  title: describeAction(l.action),
                  description: [l.user ? fullName(l.user) : 'System', l.entityType && `${l.entityType}${l.entityId ? ` #${l.entityId}` : ''}`].filter(Boolean).join(' · '),
                  at: l.createdAt,
                  icon: Activity,
                }))}
                empty="No recent activity"
              />
            )}
          </Card>
        )}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Pending actions" icon={UserCheck} />
            {pending.items.length ? (
              <ul className="divide-y divide-slate-100">
                {pending.items.map(({ key, label, icon: Icon, count, to }) => (
                  <li key={key}>
                    <Link to={to} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                      <Icon className="size-4 text-slate-400" aria-hidden />
                      <span className="flex-1 text-sm text-slate-700">{label}</span>
                      <span className={`rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${count ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{count ?? '…'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState compact title="Nothing needs your decision" />}
          </Card>
          <Card>
            <CardHeader title="System notifications" action={<CardLink to="/staff/notifications" />} />
            {notifications.isPending ? <SkeletonList rows={2} /> : notifications.data?.items.length ? (
              <ul className="divide-y divide-slate-100">{notifications.data.items.slice(0, 3).map((n) => <li key={n.id}><NotificationItem n={n} compact /></li>)}</ul>
            ) : <EmptyState compact title="No notifications" />}
          </Card>
          {quick.length > 0 && <QuickActions items={quick} columns="grid-cols-1" />}
        </div>
      </div>
    </div>
  )
}
