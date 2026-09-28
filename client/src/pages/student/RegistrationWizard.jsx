import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, Check, CheckCircle2, CircleAlert, ClipboardCheck, Clock, Download, Info,
  Printer, Save, Search, ShieldCheck, Trash2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../auth/AuthProvider'
import {
  downloadSlip, printSlip, useAvailableCourses, useCurrentRegistration, useDropCourse, useMyWaitlists, useSemesterList,
  useSubmitRegistration,
} from '../../api/student'
import {
  Badge, Button, Card, CardHeader, EmptyState, ErrorState, Modal, PageHeader, ProgressBar, Skeleton, StatusBadge, cx,
} from '../../components/ui'
import { RegistrationStepper } from '../../components/registration/RegistrationStepper'
import { RuleList, useRegistrationActions } from '../../components/RegistrationActions'
import { ScheduleList, SectionActionButton, SectionRow } from '../../components/SectionCard'
import { SuccessState } from '../../components/dashboard/Widgets'
import { summarize } from '../../lib/courses'
import { useSectionRooms } from '../../lib/socket'
import { formatDateTime, fullName, lecturerName } from '../../lib/format'

const STEPS = ['Rules & regulations', 'Qualification', 'Course selection', 'Review', 'Submit', 'Complete']
const [RULES, QUALIFY, SELECT, REVIEW, SUBMIT, DONE] = STEPS.keys()

/** Where to resume, from the registration's real status. */
const entryStep = (registration) => {
  if (!registration) return RULES
  if (['submitted', 'approved'].includes(registration.status)) return DONE
  if (registration.status === 'rejected') return REVIEW
  return registration.items?.length ? SELECT : RULES
}

function StepCard({ title, subtitle, icon, children, footer }) {
  return (
    <Card className="animate-fade-up">
      <CardHeader title={title} subtitle={subtitle} icon={icon} />
      <div className="p-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
    </Card>
  )
}

/* ── Step 1 ─────────────────────────────────────────────────────────────── */

function RulesStep({ semester, acknowledged, setAcknowledged, onNext }) {
  const rules = [
    { icon: BookOpen, title: 'Credit load', text: semester.minCredits > 0
      ? `Register between ${semester.minCredits} and ${semester.maxCredits} credits this semester.`
      : `Register up to ${semester.maxCredits} credits this semester.` },
    { icon: Clock, title: 'Registration window', text: `Registration closes ${formatDateTime(semester.registrationEnd)}. Your window opens ${formatDateTime(semester.myRegistrationOpensAt)}.` },
    semester.addDropEnd && { icon: Clock, title: 'Add/drop period', text: `After you submit, you can still add or drop courses until ${formatDateTime(semester.addDropEnd)}.` },
    { icon: ShieldCheck, title: 'Eligibility', text: 'You can only register for courses on your programme’s curriculum, at your level, with their prerequisites met.' },
    { icon: AlertTriangle, title: 'Timetable clashes', text: 'Two courses that meet at the same time cannot both be registered.' },
    { icon: ClipboardCheck, title: 'Approval', text: 'A submitted registration may need approval by an academic advisor or the registry. You’ll be notified of the decision.' },
    { icon: Info, title: 'Seats', text: 'Seats are allocated when you add a course, not when you submit. Waitlists don’t hold seats for you.' },
  ].filter(Boolean)

  return (
    <StepCard
      title="Rules & regulations"
      subtitle={`Read these before registering for ${semester.name}.`}
      icon={ShieldCheck}
      footer={(
        <>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            I have read and understood the registration rules.
          </label>
          <Button disabled={!acknowledged} onClick={onNext}>Continue <ArrowRight className="size-4" aria-hidden /></Button>
        </>
      )}
    >
      <ul className="grid gap-3 md:grid-cols-2">
        {rules.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3 rounded-lg bg-slate-50 p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-900">{title}</p>
              <p className="mt-0.5 text-sm text-slate-600">{text}</p>
            </div>
          </li>
        ))}
      </ul>
    </StepCard>
  )
}

/* ── Step 2 ─────────────────────────────────────────────────────────────── */

const CHECK_STYLE = {
  pass: { icon: CheckCircle2, cls: 'text-green-600', label: 'Met' },
  warn: { icon: CircleAlert, cls: 'text-amber-600', label: 'Check' },
  fail: { icon: XCircle, cls: 'text-red-600', label: 'Not met' },
}

function QualificationStep({ semester, registration, courses, onBack, onNext }) {
  const { user } = useAuth()
  const s = user?.student
  const eligible = courses.filter((c) => c.summary.status === 'eligible').length
  const blocked = courses.filter((c) => c.summary.status === 'blocked').length
  const opensAt = new Date(semester.myRegistrationOpensAt)
  const canChange = semester.registrationOpen || (semester.addDropOpen && registration?.submittedAt)

  const checks = [
    { label: 'Account is active', state: user?.status === 'active' ? 'pass' : 'fail', detail: user?.status === 'active' ? null : 'Contact the registry about your account.' },
    { label: 'Student status', state: s?.status === 'active' ? 'pass' : s?.status === 'probation' ? 'warn' : 'fail', detail: s?.status ? `Your status is ${s.status}.` : null },
    { label: 'No academic hold', state: s?.academicHold ? 'fail' : 'pass', detail: s?.academicHold ? 'An academic hold blocks registration. Contact the registry.' : null },
    { label: 'Programme assigned', state: s?.program ? 'pass' : 'fail', detail: s?.program?.name },
    { label: 'Registration window', state: canChange ? 'pass' : 'fail',
      detail: canChange ? `Open until ${formatDateTime(semester.registrationEnd)}` : opensAt > new Date() ? `Opens ${formatDateTime(opensAt)}` : 'Registration is closed for this semester.' },
    { label: 'Courses you can take', state: eligible || registration?.items?.length ? 'pass' : 'fail',
      detail: `${eligible} available${blocked ? ` · ${blocked} not eligible (reasons shown in the next step)` : ''}` },
    { label: 'Email verified', state: user?.emailVerifiedAt ? 'pass' : 'warn', detail: user?.emailVerifiedAt ? null : 'Not required, but you may miss email updates about your registration.' },
  ]
  const blocking = checks.some((c) => c.state === 'fail')

  return (
    <StepCard
      title="Qualification"
      subtitle="We check your record against this semester’s requirements. The final check happens when you add each course."
      icon={ClipboardCheck}
      footer={(
        <>
          <Button variant="secondary" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
          <Button disabled={blocking} onClick={onNext}>Choose courses <ArrowRight className="size-4" aria-hidden /></Button>
        </>
      )}
    >
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {checks.map((c) => {
          const style = CHECK_STYLE[c.state]
          const Icon = style.icon
          return (
            <li key={c.label} className="flex items-start gap-3 px-4 py-3">
              <Icon className={cx('mt-0.5 size-5 shrink-0', style.cls)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{c.label}</p>
                {c.detail && <p className="text-sm text-slate-500">{c.detail}</p>}
              </div>
              <span className={cx('text-xs font-medium', style.cls)}>{style.label}</span>
            </li>
          )
        })}
      </ul>
      {blocking && (
        <p role="alert" className="mt-4 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> You can’t register yet. Resolve the items marked “Not met” first.
        </p>
      )}
    </StepCard>
  )
}

/* ── Step 3 ─────────────────────────────────────────────────────────────── */

const FILTERS = [
  ['all', 'All courses'],
  ['eligible', 'Available'],
  ['registered', 'Selected'],
  ['core', 'Core'],
  ['elective', 'Elective'],
]

function CourseRow({ course, item, onAdd, onWaitlist, onRemove, onChoose, pendingId, waitlisted, canChange }) {
  const s = course.summary
  const selected = s.status === 'registered'
  const single = course.sections.length === 1 ? course.sections[0] : null
  const busy = course.sections.some((sec) => sec.id === pendingId)
  const prereqBlocked = s.reasons.some((r) => r.rule === 'PREREQUISITE')

  return (
    <li className={cx(
      'rounded-xl p-4 ring-1 transition-colors duration-200',
      selected ? 'bg-brand-50/60 ring-brand-300' : 'bg-white ring-slate-200 hover:ring-slate-300',
    )}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900">{course.code}</span>
            <StatusBadge status={s.status} label={selected ? 'Selected' : undefined} />
            <Badge className="capitalize">{course.type}</Badge>
          </div>
          <p className="text-sm text-slate-700">{course.title}</p>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span><span className="font-medium text-slate-700">{course.credits}</span> credits</span>
            <span>Level {course.level}</span>
            <span>{s.seatsAvailable} of {s.capacity} seats left</span>
            <span className={cx('inline-flex items-center gap-1', prereqBlocked ? 'text-red-700' : 'text-slate-500')}>
              {prereqBlocked ? <XCircle className="size-3.5" aria-hidden /> : <Check className="size-3.5 text-green-600" aria-hidden />}
              {prereqBlocked ? 'Prerequisites not met' : 'Prerequisites met'}
            </span>
          </p>
          {s.status === 'blocked' && s.reason && (
            <p className="flex gap-1.5 text-sm text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {s.reason.message}</p>
          )}
          {selected && item && <p className="text-xs text-brand-800">Section {item.section.sectionCode} · {lecturerName(item.section.lecturer)}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:pt-0.5">
          {selected ? (
            canChange && item && (
              <Button size="sm" variant="secondary" className="text-red-700" onClick={() => onRemove(item)}>
                <Trash2 className="size-4" aria-hidden /> Remove
              </Button>
            )
          ) : single ? (
            <SectionActionButton section={single} onAdd={onAdd} onWaitlist={onWaitlist} pendingId={pendingId} onWaitlistIds={waitlisted} />
          ) : ['eligible', 'full'].includes(s.status) && (
            <Button size="sm" loading={busy} onClick={() => onChoose(course)}>Choose section</Button>
          )}
        </div>
      </div>
    </li>
  )
}

function SelectionSummary({ semester, registration, onSave, onReview, compact }) {
  const items = registration?.items ?? []
  const credits = registration?.totalCredits ?? 0
  const belowMin = credits < semester.minCredits
  return (
    <div className={cx('space-y-4', compact && 'space-y-3')}>
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-sm font-medium text-slate-700">Total credits</p>
          <p className="text-sm tabular-nums" aria-live="polite">
            <span className="text-2xl font-semibold text-slate-900">{credits}</span>
            <span className="text-slate-500"> / {semester.maxCredits}</span>
          </p>
        </div>
        <div className="relative">
          <ProgressBar value={credits} max={semester.maxCredits} tone={belowMin ? 'amber' : 'brand'} label="Credits selected" />
          {semester.minCredits > 0 && (
            <span
              className="absolute -top-1 h-4.5 w-0.5 rounded bg-slate-400"
              style={{ left: `${Math.min(100, (semester.minCredits / semester.maxCredits) * 100)}%` }}
              title={`Minimum ${semester.minCredits}`}
              aria-hidden
            />
          )}
        </div>
        <p className={cx('mt-1.5 text-xs', belowMin ? 'text-amber-700' : 'text-slate-500')}>
          {belowMin ? `${semester.minCredits - credits} more credits needed to reach the minimum of ${semester.minCredits}.` : `${semester.maxCredits - credits} credits still available.`}
        </p>
      </div>
      {!compact && (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">Selected courses ({items.length})</p>
          {items.length ? (
            <ul className="space-y-1.5">
              {items.map((i) => (
                <li key={i.id} className="flex animate-fade-up items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate"><span className="font-medium">{i.section.course.code}</span> <span className="text-slate-500">{i.section.course.title}</span></span>
                  <span className="shrink-0 text-xs text-slate-500 tabular-nums">{i.credits} cr</span>
                </li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">No courses selected yet.</p>}
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onSave}><Save className="size-4" aria-hidden /> Save draft</Button>
        <Button className="flex-1" disabled={!items.length} onClick={onReview}>Review <ArrowRight className="size-4" aria-hidden /></Button>
      </div>
    </div>
  )
}

function SelectionStep({ semester, registration, courses, onBack, onReview, onSave }) {
  const waitlists = useMyWaitlists()
  const drop = useDropCourse()
  const { addSection, joinWaitlist, pendingId, dialog } = useRegistrationActions()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [choosing, setChoosing] = useState(null)
  const [removing, setRemoving] = useState(null)

  const waitlisted = useMemo(() => new Set((waitlists.data ?? []).map((w) => w.courseSectionId)), [waitlists.data])
  const itemsByCourse = useMemo(() => new Map((registration?.items ?? []).map((i) => [i.section.course.id, i])), [registration])
  const canChange = semester.registrationOpen || (semester.addDropOpen && registration?.submittedAt)

  const shown = courses.filter((c) => {
    const term = q.trim().toLowerCase()
    if (term && !`${c.code} ${c.title} ${c.summary.lecturers.join(' ')}`.toLowerCase().includes(term)) return false
    if (filter === 'eligible') return c.summary.status === 'eligible'
    if (filter === 'registered') return c.summary.status === 'registered'
    if (filter === 'core' || filter === 'elective') return c.type === filter
    return true
  })
  useSectionRooms(shown.flatMap((c) => c.sections.map((s) => s.id)))

  const confirmRemove = () => drop.mutate(removing.id, {
    onSuccess: () => toast.success(`Removed ${removing.section.course.code}`),
    onError: (err) => toast.error(err.message),
    onSettled: () => setRemoving(null),
  })

  const choosingLive = choosing && courses.find((c) => c.id === choosing.id)

  return (
    <div className="grid gap-6 pb-28 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-0">
      <Card className="animate-fade-up">
        <CardHeader title="Course selection" subtitle="Add courses to your registration. Each change is saved as you go." icon={BookOpen} />
        <div className="space-y-3 border-b border-slate-100 p-4">
          <label className="relative block">
            <span className="sr-only">Search courses</span>
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by code, title or lecturer…"
              className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </label>
          <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter courses">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={cx('shrink-0 rounded-full px-3 py-1 text-sm font-medium transition', filter === key ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {shown.length ? (
            <ul className="space-y-3">
              {shown.map((c) => (
                <CourseRow
                  key={c.id}
                  course={c}
                  item={itemsByCourse.get(c.id)}
                  onAdd={addSection}
                  onWaitlist={joinWaitlist}
                  onRemove={setRemoving}
                  onChoose={setChoosing}
                  pendingId={pendingId}
                  waitlisted={waitlisted}
                  canChange={canChange}
                />
              ))}
            </ul>
          ) : (
            <EmptyState compact title={courses.length ? 'No courses match' : 'No courses offered for your programme'} icon={BookOpen}>
              {courses.length ? 'Try another search or filter.' : 'Check back later or contact your department.'}
            </EmptyState>
          )}
        </div>
        <div className="flex border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
        </div>
      </Card>

      <aside className="hidden lg:block">
        <Card className="sticky top-24 p-5">
          <h2 className="mb-4 font-semibold">Registration summary</h2>
          <SelectionSummary semester={semester} registration={registration} onSave={onSave} onReview={onReview} />
        </Card>
      </aside>

      {/* Mobile: the summary rides along at the bottom of the screen. */}
      <div className="fixed inset-x-0 bottom-0 z-20 animate-sheet-up border-t border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_-12px_rgb(15_23_42/0.2)] backdrop-blur lg:hidden">
        <SelectionSummary compact semester={semester} registration={registration} onSave={onSave} onReview={onReview} />
      </div>

      <Modal open={Boolean(choosingLive)} onClose={() => setChoosing(null)} wide title={choosingLive ? `${choosingLive.code} · choose a section` : ''} description={choosingLive?.title}>
        {choosingLive && (
          <div className="space-y-3">
            {choosingLive.sections.map((sec) => (
              <SectionRow
                key={sec.id}
                section={sec}
                actions={(section) => (
                  <SectionActionButton section={section} onAdd={(id) => { addSection(id); setChoosing(null) }} onWaitlist={joinWaitlist} pendingId={pendingId} onWaitlistIds={waitlisted} />
                )}
              />
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.section.course.code}?`}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>Keep course</Button>
            <Button variant="danger" loading={drop.isPending} onClick={confirmRemove}>Remove course</Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">You’ll give up your seat in this section. If it fills up, you may not get it back.</p>
      </Modal>
      {dialog}
    </div>
  )
}

/* ── Steps 4 & 5 ────────────────────────────────────────────────────────── */

function RegistrationSummary({ semester, record, registration }) {
  const { user } = useAuth()
  const s = user?.student
  const items = registration?.items ?? []
  const info = [
    ['Student', fullName(user)],
    ['Student number', s?.studentNumber],
    ['Programme', s?.program?.name],
    ['Level', s?.level],
    ['Academic year', record?.academicYear?.name ?? '—'],
    ['Semester', semester.name],
  ]
  return (
    <div className="space-y-5">
      <dl className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
        {info.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="text-sm font-semibold text-slate-900">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full min-w-160 text-sm">
          <caption className="sr-only">Selected courses</caption>
          <thead className="bg-slate-50 text-left text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">Course</th>
              <th scope="col" className="py-2.5 font-medium">Section</th>
              <th scope="col" className="py-2.5 font-medium">Schedule</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((i) => (
              <tr key={i.id}>
                <td className="px-4 py-3 align-top">
                  <p className="font-semibold">{i.section.course.code}</p>
                  <p className="text-slate-500">{i.section.course.title}</p>
                </td>
                <td className="py-3 align-top text-slate-600">{i.section.sectionCode}<p className="text-xs">{lecturerName(i.section.lecturer)}</p></td>
                <td className="py-3 align-top"><ScheduleList schedules={i.section.schedules} /></td>
                <td className="px-4 py-3 text-right align-top font-medium tabular-nums">{i.credits}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <th scope="row" colSpan={3} className="px-4 py-2.5 text-left font-medium">Total credits</th>
              <td className="px-4 py-2.5 text-right text-base font-semibold tabular-nums">{registration?.totalCredits ?? 0}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function ReviewStep({ semester, record, registration, onBack, onNext }) {
  const credits = registration?.totalCredits ?? 0
  const belowMin = credits < semester.minCredits
  return (
    <StepCard
      title="Review your registration"
      subtitle="Check everything before you submit."
      icon={ClipboardCheck}
      footer={(
        <>
          <Button variant="secondary" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Edit courses</Button>
          <Button disabled={belowMin || !registration?.items?.length} onClick={onNext}>Continue to submit <ArrowRight className="size-4" aria-hidden /></Button>
        </>
      )}
    >
      {registration?.status === 'rejected' && registration.remarks && (
        <p className="mb-4 flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span><span className="font-medium">Changes requested:</span> {registration.remarks}</span>
        </p>
      )}
      {belowMin && (
        <p className="mb-4 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> Add at least {semester.minCredits - credits} more credits before submitting.
        </p>
      )}
      <RegistrationSummary semester={semester} record={record} registration={registration} />
    </StepCard>
  )
}

function SubmitStep({ registration, onBack, onSave, onSubmitted }) {
  const submit = useSubmitRegistration()
  const [failures, setFailures] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const items = registration?.items ?? []

  const doSubmit = () => submit.mutate(undefined, {
    onSuccess: (reg) => {
      setConfirming(false)
      toast.success(reg.status === 'approved' ? 'Registration confirmed' : 'Registration submitted for approval')
      onSubmitted()
    },
    onError: (err) => {
      setConfirming(false)
      if (err.code === 'REGISTRATION_RULES_FAILED' && Array.isArray(err.details)) setFailures(err.details)
      else toast.error(err.message)
    },
  })

  return (
    <StepCard
      title="Submit registration"
      subtitle="Submitting sends your courses for final checks and approval."
      icon={ClipboardCheck}
      footer={(
        <>
          <Button variant="secondary" onClick={onBack}><ArrowLeft className="size-4" aria-hidden /> Back to review</Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onSave}><Save className="size-4" aria-hidden /> Save draft</Button>
            <Button onClick={() => setConfirming(true)}>Submit registration</Button>
          </div>
        </>
      )}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Courses', items.length],
          ['Total credits', registration?.totalCredits ?? 0],
          ['Status', <StatusBadge key="s" status={registration?.status ?? 'draft'} />],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>
      <ul className="mt-5 space-y-2 text-sm text-slate-600">
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> All prerequisite, credit and timetable rules are re-checked on submission.</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> You’ll get a reference number and a printable registration slip.</li>
        <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-green-600" aria-hidden /> Changes after approval send your registration back for approval.</li>
      </ul>
      {failures && (
        <div role="alert" className="mt-5 animate-shake rounded-lg bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="mb-3 text-sm font-semibold text-amber-900">Your registration can’t be submitted yet</p>
          <RuleList failures={failures} />
        </div>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Submit your registration?"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button loading={submit.isPending} onClick={doSubmit}>Yes, submit</Button>
          </>
        )}
      >
        <p className="text-sm text-slate-600">
          You’re submitting {items.length} course{items.length === 1 ? '' : 's'} ({registration?.totalCredits ?? 0} credits). You can still make changes during add/drop.
        </p>
      </Modal>
    </StepCard>
  )
}

/* ── Step 6 ─────────────────────────────────────────────────────────────── */

function CompleteStep({ semester, record, registration, onChange }) {
  const [busy, setBusy] = useState(null)
  const approved = registration?.status === 'approved'
  const canChange = semester.registrationOpen || semester.addDropOpen

  const run = (kind, fn) => async () => {
    setBusy(kind)
    try { await fn(registration.id, registration.referenceNumber) } catch (err) { toast.error(err.message) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <SuccessState
          title={approved ? 'Registration complete' : 'Registration submitted'}
          actions={registration?.referenceNumber && (
            <>
              <Button loading={busy === 'download'} onClick={run('download', downloadSlip)}><Download className="size-4" aria-hidden /> Download registration slip</Button>
              <Button variant="secondary" loading={busy === 'print'} onClick={run('print', printSlip)}><Printer className="size-4" aria-hidden /> Print registration slip</Button>
            </>
          )}
        >
          <p>
            {approved
              ? `You’re registered for ${semester.name}.`
              : 'Your registration is awaiting approval. We’ll notify you as soon as it’s reviewed.'}
          </p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <StatusBadge status={registration?.status} />
            {registration?.referenceNumber && <span className="font-mono text-sm text-slate-700">Ref. {registration.referenceNumber}</span>}
          </p>
        </SuccessState>
      </Card>
      <Card>
        <CardHeader
          title="Registration summary"
          action={(
            <div className="flex gap-2">
              {canChange && <Button size="sm" variant="secondary" onClick={onChange}>Add or drop courses</Button>}
              <Link to="/student/my-courses"><Button size="sm" variant="ghost">My courses</Button></Link>
            </div>
          )}
        />
        <div className="p-5"><RegistrationSummary semester={semester} record={record} registration={registration} /></div>
      </Card>
    </div>
  )
}

/* ── Page ───────────────────────────────────────────────────────────────── */

export default function RegistrationWizard() {
  const navigate = useNavigate()
  const current = useCurrentRegistration()
  const available = useAvailableCourses()
  const semesters = useSemesterList()
  const [chosenStep, setChosenStep] = useState(null)
  const [maxReached, setMaxReached] = useState(0)
  const [acknowledged, setAcknowledged] = useState(false)

  const courses = useMemo(() => (available.data?.courses ?? []).map((c) => ({ ...c, summary: summarize(c) })), [available.data])

  if (current.isPending || available.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-10 w-full" />
        <Card className="space-y-3 p-5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</Card>
      </div>
    )
  }
  const failed = current.isError ? current : available.isError ? available : null
  if (failed) return <Card><ErrorState title="Unable to load registration data" error={failed.error} onRetry={() => failed.refetch()} /></Card>

  const { semester, registration } = current.data
  const record = semesters.data?.find((s) => s.id === semester.id)
  const step = chosenStep ?? entryStep(registration)
  const reached = Math.max(maxReached, step)

  const go = (next) => {
    setChosenStep(next)
    setMaxReached((m) => Math.max(m, next))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const saveDraft = () => {
    toast.success('Draft saved', { description: 'Your selected courses are kept. Come back any time before the deadline to submit.' })
    navigate('/student')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Course registration"
        title={semester.name}
        subtitle={[record?.academicYear?.name && `Academic year ${record.academicYear.name}`, `Deadline ${formatDateTime(semester.registrationEnd)}`].filter(Boolean).join(' · ')}
        action={registration?.status && <StatusBadge status={registration.status} />}
      />
      <RegistrationStepper steps={STEPS} current={step} maxReached={step === DONE ? DONE : Math.min(reached, SUBMIT)} onSelect={step === DONE ? undefined : go} />

      {step === RULES && <RulesStep semester={semester} acknowledged={acknowledged} setAcknowledged={setAcknowledged} onNext={() => go(QUALIFY)} />}
      {step === QUALIFY && <QualificationStep semester={semester} registration={registration} courses={courses} onBack={() => go(RULES)} onNext={() => go(SELECT)} />}
      {step === SELECT && (
        <SelectionStep semester={semester} registration={registration} courses={courses} onBack={() => go(QUALIFY)} onReview={() => go(REVIEW)} onSave={saveDraft} />
      )}
      {step === REVIEW && <ReviewStep semester={semester} record={record} registration={registration} onBack={() => go(SELECT)} onNext={() => go(SUBMIT)} />}
      {step === SUBMIT && <SubmitStep registration={registration} onBack={() => go(REVIEW)} onSave={saveDraft} onSubmitted={() => go(DONE)} />}
      {step === DONE && <CompleteStep semester={semester} record={record} registration={registration} onChange={() => go(SELECT)} />}
    </div>
  )
}
