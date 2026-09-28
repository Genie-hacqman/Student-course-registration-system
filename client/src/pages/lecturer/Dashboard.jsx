import { Link } from 'react-router-dom'
import {
  BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, Clock, GraduationCap, ListTodo, MapPin, Megaphone, NotebookPen,
  UserCheck, UsersRound,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { currentSections, useLecturerTasks, useLecturerTimetable, useMySections } from '../../api/lecturer'
import { useNotifications } from '../../api/notifications'
import { useAnnouncements } from '../../api/announcements'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, ProgressBar, SkeletonChart, SkeletonList,
} from '../../components/ui'
import { StatCard, StatGrid } from '../../components/dashboard/StatCard'
import { ActivityList, CardLink, MetaChip, QuickActions, WelcomeHeader } from '../../components/dashboard/Widgets'
import { CATEGORIES, categoryOf } from '../../components/dashboard/NotificationItems'
import { BarBreakdown } from '../../components/charts/Charts'
import { today } from '../../lib/teaching'
import { formatDate, formatTime } from '../../lib/format'

const TASK_META = {
  attendance: { icon: UserCheck, tone: 'bg-green-50 text-green-700', to: (t) => `/lecturer/attendance?section=${t.sectionId}${t.scheduleId ? `&slot=${t.scheduleId}` : ''}` },
  grade_assessment: { icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700', to: (t) => `/lecturer/assessments?section=${t.sectionId}` },
  publish_assessment: { icon: NotebookPen, tone: 'bg-brand-50 text-brand-700', to: (t) => `/lecturer/assessments?section=${t.sectionId}` },
  submit_grades: { icon: GraduationCap, tone: 'bg-red-50 text-red-700', to: (t) => `/lecturer/results?section=${t.sectionId}` },
}

function TodaysClasses({ timetable, seats }) {
  if (timetable.isPending) return <SkeletonList rows={2} />
  if (timetable.isError) return <ErrorState error={timetable.error} onRetry={() => timetable.refetch()} />
  const classes = timetable.data.days.find((d) => d.day === today().day)?.classes ?? []
  if (!classes.length) return <EmptyState compact title="No classes today" icon={CalendarDays}>Enjoy the break — your next classes are on the timetable.</EmptyState>
  return (
    <ul className="divide-y divide-slate-100">
      {classes.map((c, i) => (
        <li key={`${c.sectionId}-${c.startTime}`} className="stagger flex animate-fade-up flex-wrap items-center gap-4 px-5 py-3.5" style={{ '--i': i }}>
          <div className="w-20 shrink-0 text-sm">
            <p className="font-semibold tabular-nums">{formatTime(c.startTime)}</p>
            <p className="text-xs text-slate-500 tabular-nums">to {formatTime(c.endTime)}</p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-slate-900">{c.course.code} <span className="font-normal text-slate-500">· {c.course.title}</span></p>
            <p className="flex flex-wrap gap-x-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden /> {c.room ?? 'Room TBA'}</span>
              <span className="inline-flex items-center gap-1"><UsersRound className="size-3" aria-hidden /> {seats.get(c.sectionId) ?? 0} students</span>
            </p>
          </div>
          <Link to={`/lecturer/attendance?section=${c.sectionId}`}><Button size="sm" variant="secondary"><UserCheck className="size-4" aria-hidden /> Take attendance</Button></Link>
        </li>
      ))}
    </ul>
  )
}

function Tasks({ tasks }) {
  if (tasks.isPending) return <SkeletonList rows={3} />
  if (tasks.isError) return <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
  if (!tasks.data.length) return <EmptyState compact title="You’re all caught up" icon={CheckCircle2}>New tasks appear when classes, assessments or grades need you.</EmptyState>
  return (
    <ul className="divide-y divide-slate-100">
      {tasks.data.map((t) => {
        const meta = TASK_META[t.type] ?? TASK_META.attendance
        const Icon = meta.icon
        return (
          <li key={`${t.type}-${t.sectionId}-${t.assessmentId ?? t.scheduleId ?? ''}`}>
            <Link to={meta.to(t)} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${meta.tone}`}><Icon className="size-4" aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">{t.title}</span>
                <span className="block truncate text-xs text-slate-500">{t.description}</span>
              </span>
              {t.priority === 'high' ? <Badge tone="red">Due</Badge> : t.dueAt && <span className="hidden text-xs text-slate-400 sm:block">{formatDate(t.dueAt)}</span>}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export default function LecturerDashboard() {
  const { user } = useAuth()
  const sections = useMySections()
  const timetable = useLecturerTimetable()
  const tasks = useLecturerTasks()
  const notifications = useNotifications({ page: 1, limit: 5 })
  const announcements = useAnnouncements({ page: 1, limit: 3 })

  const current = currentSections(sections.data ?? [])
  const seats = new Map(current.map((s) => [s.id, s.seatsTaken]))
  const students = current.reduce((n, s) => n + s.seatsTaken, 0)
  const classesToday = timetable.data?.days.find((d) => d.day === today().day)?.classes.length ?? 0
  const semesterName = current[0]?.semester?.name
  const title = user?.lecturer?.title

  const activity = [
    ...(notifications.data?.items ?? []).map((n) => {
      const cat = CATEGORIES[categoryOf(n.type)]
      return { id: `n${n.id}`, title: n.title, description: n.message, at: n.createdAt, icon: cat.icon, toneClass: cat.dot }
    }),
    ...(announcements.data?.items ?? []).map((a) => ({
      id: `a${a.id}`, title: a.title, description: a.body, at: a.createdAt, icon: Megaphone, toneClass: 'bg-violet-50 text-violet-600', to: '/lecturer/announcements',
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 6)

  return (
    <div className="space-y-6">
      <WelcomeHeader
        name={[title, user?.lastName].filter(Boolean).join(' ') || user?.firstName}
        subtitle="Your teaching at a glance: today’s classes, your courses and what needs attention."
        meta={(
          <>
            {semesterName && <MetaChip icon={CalendarDays}>{semesterName}</MetaChip>}
            {user?.lecturer?.department?.name && <MetaChip icon={GraduationCap}>{user.lecturer.department.name}</MetaChip>}
          </>
        )}
      />

      <StatGrid>
        <StatCard index={0} label="Assigned courses" icon={BookOpen} value={sections.isPending ? undefined : current.length} hint={semesterName} to="/lecturer/courses" />
        <StatCard index={1} label="Total students" icon={UsersRound} tone="green" value={sections.isPending ? undefined : students} hint="Across your current courses" to="/lecturer/students" />
        <StatCard index={2} label="Classes today" icon={Clock} tone="violet" value={timetable.isPending ? undefined : classesToday} hint={new Date().toLocaleDateString(undefined, { weekday: 'long' })} />
        <StatCard index={3} label="Pending tasks" icon={ListTodo} tone="amber" value={tasks.isPending ? undefined : tasks.data?.length ?? '—'} hint="Attendance, grading, results" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Today’s classes" icon={CalendarDays} action={<CardLink to="/lecturer/timetable">Timetable</CardLink>} />
          <TodaysClasses timetable={timetable} seats={seats} />
        </Card>
        <Card>
          <CardHeader title="Upcoming tasks" icon={ListTodo} />
          <Tasks tasks={tasks} />
        </Card>
      </div>

      <Card>
        <CardHeader title="Course overview" subtitle={semesterName} icon={BookOpen} action={<CardLink to="/lecturer/courses">All courses</CardLink>} />
        {sections.isPending ? <SkeletonList rows={3} /> : sections.isError ? <ErrorState error={sections.error} onRetry={() => sections.refetch()} /> : current.length ? (
          <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {current.map((s, i) => (
              <li key={s.id} className="stagger animate-fade-up" style={{ '--i': i }}>
                <Link to={`/lecturer/courses/${s.id}`} className="block h-full rounded-xl p-4 ring-1 ring-slate-200 transition hover:shadow-md hover:ring-brand-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-brand-700">{s.course.code}</p>
                      <p className="truncate font-medium text-slate-900">{s.course.title}</p>
                    </div>
                    <Badge>Sec. {s.sectionCode}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Level {s.course.level} · {s.course.credits} credits · {s.semester?.name}</p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Students</span><span className="font-medium text-slate-700 tabular-nums">{s.seatsTaken} / {s.capacity}</span></div>
                    <ProgressBar value={s.seatsTaken} max={s.capacity} size="sm" label={`${s.course.code} enrolment`} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No courses assigned yet" icon={BookOpen}>The registry assigns lecturers to course sections.</EmptyState>}
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Students per course" />
          <div className="p-4">
            {sections.isPending ? <SkeletonChart height={180} /> : current.length
              ? <BarBreakdown data={current.map((s) => ({ label: `${s.course.code}-${s.sectionCode}`, value: s.seatsTaken }))} valueLabel="Students" />
              : <EmptyState compact title="No courses yet" />}
          </div>
        </Card>
        <Card>
          <CardHeader title="Recent activity" action={<CardLink to="/lecturer/notifications" />} />
          {notifications.isPending ? <SkeletonList rows={3} /> : <ActivityList items={activity} empty="No recent activity" />}
        </Card>
        <QuickActions
          columns="grid-cols-1"
          items={[
            { to: '/lecturer/courses', label: 'View my courses', icon: BookOpen },
            { to: '/lecturer/students', label: 'View students', icon: UsersRound },
            { to: '/lecturer/results', label: 'Submit results', icon: GraduationCap },
            { to: '/lecturer/timetable', label: 'View timetable', icon: CalendarDays },
            { to: '/lecturer/announcements', label: 'Create announcement', icon: Megaphone },
          ]}
        />
      </div>
    </div>
  )
}
