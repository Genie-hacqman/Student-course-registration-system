import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, ClipboardList, Download, NotebookPen, Printer, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  downloadSlip, printSlip, useCurrentRegistration, useDropCourse, useLeaveWaitlist, useMyWaitlists, useSubmitRegistration,
} from '../../api/student'
import { useMyAttendance } from '../../api/attendance'
import { useMyAssessments } from '../../api/assessments'
import {
  Badge, Button, Card, CardHeader, EmptyState, Modal, PageHeader, ProgressBar, QueryState, Skeleton, SkeletonList, StatusBadge, cx,
} from '../../components/ui'
import { RuleList } from '../../components/RegistrationActions'
import { ScheduleList } from '../../components/SectionCard'
import { formatDate, formatDateTime, lecturerName, windowState } from '../../lib/format'

function CourseInsights({ sectionId, attendance, assessments }) {
  const att = attendance.data?.find((a) => a.section.id === sectionId)
  const work = assessments.data?.find((a) => a.section.id === sectionId)?.assessments ?? []
  return (
    <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 md:grid-cols-2">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase"><UserCheck className="size-3.5" aria-hidden /> Attendance</p>
        {attendance.isPending ? <Skeleton className="h-10 w-full" /> : att?.sessions ? (
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium">{att.rate}% attended</span>
              <span className="text-slate-500">{att.sessions} class{att.sessions === 1 ? '' : 'es'} recorded</span>
            </div>
            <ProgressBar value={att.rate} max={100} tone={att.rate < 75 ? 'amber' : 'green'} label="Attendance rate" size="sm" />
            <p className="mt-1.5 text-xs text-slate-500">{att.counts.present} present · {att.counts.late} late · {att.counts.absent} absent · {att.counts.excused} excused</p>
          </div>
        ) : <p className="text-sm text-slate-500">No attendance recorded yet.</p>}
      </div>
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-slate-500 uppercase"><NotebookPen className="size-3.5" aria-hidden /> Assessments</p>
        {assessments.isPending ? <Skeleton className="h-10 w-full" /> : work.length ? (
          <ul className="space-y-1.5">
            {work.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{a.title}</span>
                  <span className="text-slate-500"> · {a.weight}%{a.dueAt ? ` · due ${formatDate(a.dueAt)}` : ''}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{a.score === null ? <span className="text-slate-400">Not graded</span> : `${a.score} / ${a.maxScore}`}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">No assessments published yet.</p>}
      </div>
    </div>
  )
}

function WaitlistCard() {
  const waitlists = useMyWaitlists()
  const leave = useLeaveWaitlist()
  if (waitlists.isPending) return <Skeleton className="h-24 w-full rounded-xl" />
  if (!waitlists.data?.length) return null
  return (
    <Card>
      <CardHeader title="Waitlists" subtitle="You'll be notified when a seat opens. Seats aren't held — register quickly." />
      <ul className="divide-y divide-slate-100">
        {waitlists.data.map((w) => (
          <li key={w.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <span>
              <span className="font-medium">{w.section?.course?.code ?? `Section ${w.courseSectionId}`}</span>
              <span className="text-slate-500"> {w.section?.course?.title} · position {w.position}</span>
              {w.status === 'notified' && <Badge tone="green">Seat available</Badge>}
            </span>
            <Button size="sm" variant="ghost" loading={leave.isPending && leave.variables === w.id} onClick={() => leave.mutate(w.id)}>
              Leave
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function MyRegistration() {
  const current = useCurrentRegistration()
  const drop = useDropCourse()
  const submit = useSubmitRegistration()
  const [confirmDrop, setConfirmDrop] = useState(null)
  const [failures, setFailures] = useState(null)
  const [downloading, setDownloading] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const attendance = useMyAttendance()
  const assessments = useMyAssessments()

  const onError = (err) => {
    if (err.code === 'REGISTRATION_RULES_FAILED' && Array.isArray(err.details)) setFailures(err.details)
    else toast.error(err.message)
  }

  const doDrop = () => drop.mutate(confirmDrop.id, {
    onSuccess: () => toast.success(`Dropped ${confirmDrop.section.course.code}`),
    onError,
    onSettled: () => setConfirmDrop(null),
  })

  const doSubmit = () => submit.mutate(undefined, {
    onSuccess: (reg) => toast.success(reg.status === 'approved' ? 'Registration confirmed' : 'Registration submitted for approval'),
    onError,
  })

  const slip = (kind, fn) => async (reg) => {
    setDownloading(kind)
    try {
      await fn(reg.id, reg.referenceNumber)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Courses" subtitle={current.data && `${current.data.semester.name} · your registered courses, attendance and coursework`} />
      <QueryState query={current} fallback={<Card><SkeletonList rows={4} /></Card>} errorTitle="Unable to load your courses">
        {({ semester, registration }) => {
          const items = registration?.items ?? []
          const credits = registration?.totalCredits ?? 0
          const win = windowState(semester, registration)
          const canSubmit = items.length > 0 && ['draft', 'rejected', 'cancelled'].includes(registration?.status)
          const canChange = semester.registrationOpen || (semester.addDropOpen && registration?.submittedAt)
          return (
            <>
              <Card className="p-5">
                <div className="grid gap-5 md:grid-cols-3">
                  <div>
                    <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Status</p>
                    <div className="mt-1"><StatusBadge status={registration?.status ?? 'not_started'} /></div>
                    {registration?.referenceNumber && <p className="mt-2 text-sm text-slate-500">Ref. {registration.referenceNumber}</p>}
                    {registration?.status === 'approved' && registration.timetableConfirmedAt && (
                      <p className="mt-1 text-sm text-green-700">Timetable confirmed {formatDateTime(registration.timetableConfirmedAt)}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Registration period</p>
                    <div className="mt-1"><Badge tone={win.tone}>{win.label}</Badge></div>
                    <p className="mt-2 text-sm text-slate-500">Closes {formatDateTime(semester.registrationEnd)}</p>
                  </div>
                  <div>
                    <div className="mb-1.5 flex justify-between text-sm">
                      <span className="font-medium">Credits</span>
                      <span className="text-slate-600">{credits} / {semester.maxCredits}</span>
                    </div>
                    <ProgressBar value={credits} max={semester.maxCredits} tone={credits < semester.minCredits ? 'amber' : 'brand'} label="Credits registered" />
                    <p className="mt-1.5 text-xs text-slate-500">
                      {semester.minCredits > 0 ? `Between ${semester.minCredits} and ${semester.maxCredits} credits required` : `Maximum ${semester.maxCredits} credits`}
                    </p>
                  </div>
                </div>
                {registration?.remarks && (
                  <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    <span className="font-medium">Reviewer remarks:</span> {registration.remarks}
                  </div>
                )}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {registration?.referenceNumber && (
                    <>
                      <Button variant="secondary" loading={downloading === 'print'} onClick={() => slip('print', printSlip)(registration)}>
                        <Printer className="size-4" aria-hidden /> Print slip
                      </Button>
                      <Button variant="secondary" loading={downloading === 'download'} onClick={() => slip('download', downloadSlip)(registration)}>
                        <Download className="size-4" aria-hidden /> Download slip
                      </Button>
                    </>
                  )}
                  {canSubmit && <Link to="/student/registration"><Button variant="secondary">Review in registration</Button></Link>}
                  {canSubmit && <Button loading={submit.isPending} onClick={doSubmit}>Submit registration</Button>}
                </div>
              </Card>

              <Card>
                <CardHeader title={`Registered courses (${items.length})`} action={<Link to="/student/registration"><Button size="sm" variant="secondary">Add courses</Button></Link>} />
                {items.length ? (
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <li key={item.id}>
                      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1.5">
                          <p>
                            <Link to={`/student/courses/${item.section.course.id}`} className="font-semibold hover:text-brand-700">{item.section.course.code}</Link>
                            <span className="text-slate-600"> {item.section.course.title}</span>
                            {item.addedBy && <Badge tone="blue">Added by the registry</Badge>}
                          </p>
                          <p className="text-sm text-slate-500">
                            Section {item.section.sectionCode} · {item.credits} credits · {lecturerName(item.section.lecturer)}
                          </p>
                          <ScheduleList schedules={item.section.schedules} />
                        </div>
                        <div className="flex shrink-0 gap-1 self-start">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-expanded={expanded === item.id}
                            onClick={() => setExpanded((e) => (e === item.id ? null : item.id))}
                          >
                            Progress <ChevronDown className={cx('size-4 transition-transform', expanded === item.id && 'rotate-180')} aria-hidden />
                          </Button>
                          {canChange && (
                            <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setConfirmDrop(item)}>
                              <Trash2 className="size-4" aria-hidden /> Drop
                            </Button>
                          )}
                        </div>
                      </div>
                      {expanded === item.id && <CourseInsights sectionId={item.section.id} attendance={attendance} assessments={assessments} />}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No courses yet" icon={ClipboardList}>
                    <Link to="/student/registration" className="font-medium text-brand-600">Start your registration</Link> to add courses.
                  </EmptyState>
                )}
              </Card>
            </>
          )
        }}
      </QueryState>

      <WaitlistCard />

      <Modal
        open={Boolean(confirmDrop)}
        onClose={() => setConfirmDrop(null)}
        title="Drop this course?"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirmDrop(null)}>Cancel</Button>
            <Button variant="danger" loading={drop.isPending} onClick={doDrop}>Drop course</Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          You'll lose your seat in <span className="font-medium">{confirmDrop?.section.course.code}</span>. If the section fills up, you may not get it back.
          {' '}An approved registration goes back for approval after any change.
        </p>
      </Modal>

      <Modal
        open={Boolean(failures)}
        onClose={() => setFailures(null)}
        title="Your registration can't be submitted yet"
        footer={<Button variant="secondary" onClick={() => setFailures(null)}>Close</Button>}
      >
        {failures && <RuleList failures={failures} />}
      </Modal>
    </div>
  )
}
