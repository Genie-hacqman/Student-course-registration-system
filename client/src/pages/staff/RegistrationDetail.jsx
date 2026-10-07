import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarX2, Check, Download, X } from 'lucide-react'
import { toast } from 'sonner'
import { downloadStaffSlip, fetchNextPending, useRegistration, useReview } from '../../api/staff'
import { useAuth } from '../../auth/AuthProvider'
import { Badge, Button, Card, CardHeader, ErrorState, Loading, Modal } from '../../components/ui'
import { ScheduleList } from '../../components/SectionCard'
import { RemoveStudentDialog } from '../../components/admin/StaffEnrolment'
import TimetableIssueList from '../../components/admin/TimetableIssueList'
import { useApi } from '../../api/admin'
import { REGISTRATION_STATUS, formatDateTime, fullName, lecturerName } from '../../lib/format'
import { PERMS, can } from '../../lib/roles'

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children ?? '—'}</dd>
    </div>
  )
}

export default function RegistrationDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const registration = useRegistration(id)
  const review = useReview()
  const [decision, setDecision] = useState(null)
  const [remarks, setRemarks] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [removing, setRemoving] = useState(null)
  const issues = useApi('/admin/timetable-issues', { registrationId: id, status: 'open', limit: 50 })

  if (registration.isPending) return <Loading />
  if (registration.isError) return <ErrorState error={registration.error} onRetry={() => registration.refetch()} />
  const r = registration.data
  const status = REGISTRATION_STATUS[r.status]
  const canReview = can(user, PERMS.REGISTRATION_APPROVE) && r.status === 'submitted'
  const rejecting = decision === 'reject'

  const open = (d) => {
    setRemarks('')
    setDecision(d)
  }

  const confirm = () => review.mutate({ id: r.id, decision, remarks: remarks.trim() }, {
    onSuccess: async () => {
      toast.success(`${fullName(r.student.user)}'s registration ${rejecting ? 'was sent back for changes' : 'is approved'}`)
      setDecision(null)
      const next = await fetchNextPending(r.semesterId, r.id).catch(() => null)
      navigate(next ? `/staff/registrations/${next.id}` : `/staff/registrations?status=submitted&semester=${r.semesterId}`)
    },
    onError: (err) => {
      toast.error(err.message)
      setDecision(null)
      if (err.status === 409) registration.refetch()
      if (err.code === 'TIMETABLE_CONFLICT') issues.refetch()
    },
  })

  const slip = async () => {
    setDownloading(true)
    try {
      await downloadStaffSlip(r.id, r.referenceNumber)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link to={`/staff/registrations?semester=${r.semesterId}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Back to registrations
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{fullName(r.student.user)}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{r.semester?.name} registration</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {r.referenceNumber && (
              <Button variant="secondary" loading={downloading} onClick={slip}><Download className="size-4" /> Slip</Button>
            )}
            {canReview && (
              <>
                <Button variant="secondary" className="text-red-600" onClick={() => open('reject')}><X className="size-4" /> Reject</Button>
                <Button onClick={() => open('approve')}><Check className="size-4" /> Approve</Button>
              </>
            )}
          </div>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Student no.">{r.student.studentNumber}</Field>
          <Field label="Email">{r.student.user.email}</Field>
          <Field label="Level">{r.student.level}</Field>
          <Field label="Status">{status && <Badge tone={status.tone}>{status.label}</Badge>}</Field>
          <Field label="Submitted">{r.submittedAt && formatDateTime(r.submittedAt)}</Field>
          <Field label="Reference">{r.referenceNumber}</Field>
          {r.timetableConfirmedAt && <Field label="Timetable confirmed">{formatDateTime(r.timetableConfirmedAt)}</Field>}
        </dl>
        {r.remarks && (
          <p className="mt-5 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            <span className="font-medium">Remarks{r.reviewedAt ? ` (${formatDateTime(r.reviewedAt)})` : ''}:</span> {r.remarks}
          </p>
        )}
      </Card>

      {issues.data?.items?.length > 0 && (
        <Card className="ring-red-200">
          <CardHeader
            icon={CalendarX2}
            title="The timetable can't be confirmed"
            subtitle="Approval is blocked until these are fixed: move a class or room, reassign the lecturer, or remove the course. Then approve again."
            action={<Link to="/staff/timetable-issues" className="text-sm font-medium text-brand-600 hover:text-brand-700">All timetable issues</Link>}
          />
          <div className="px-5 py-4"><TimetableIssueList issues={issues.data.items} /></div>
        </Card>
      )}

      <Card>
        <CardHeader title={`Courses (${r.items.length})`} subtitle={`${r.totalCredits} credits in total`} />
        {r.items.length ? (
          <ul className="divide-y divide-slate-100">
            {r.items.map((item) => (
              <li key={item.id} className="space-y-1.5 px-5 py-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p><span className="font-semibold">{item.section.course.code}</span> <span className="text-slate-600">{item.section.course.title}</span></p>
                  <span className="flex items-center gap-3 text-sm text-slate-600">
                    {item.credits} credits
                    {can(user, PERMS.REGISTRATION_MANAGE) && (
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRemoving(item)}>Remove</Button>
                    )}
                  </span>
                </div>
                <p className="text-sm text-slate-500">Section {item.section.sectionCode} · {lecturerName(item.section.lecturer)}</p>
                <ScheduleList schedules={item.section.schedules} />
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-sm text-slate-500">No courses.</p>}
      </Card>

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={rejecting ? 'Send back for changes' : 'Approve registration'}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDecision(null)}>Cancel</Button>
            <Button
              variant={rejecting ? 'danger' : 'primary'}
              loading={review.isPending}
              disabled={rejecting && !remarks.trim()}
              onClick={confirm}
            >
              {rejecting ? 'Reject' : 'Approve'}
            </Button>
          </>
        )}
      >
        <p className="mb-3 text-sm text-slate-600">
          {rejecting
            ? `${r.student.user.firstName} will be notified with your reason and can update and resubmit.`
            : `${r.student.user.firstName}'s ${r.totalCredits}-credit registration will be confirmed and they'll be notified. Their timetable is checked for student, lecturer and room clashes first; any clash blocks the approval.`}
        </p>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{rejecting ? 'Reason (required)' : 'Note (optional)'}</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            className="block w-full rounded-lg border-0 px-3 py-2 text-sm shadow-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
            placeholder={rejecting ? 'e.g. Replace CS204 with a core course.' : ''}
          />
          <span className="mt-1 block text-right text-xs text-slate-400">{remarks.length}/500</span>
        </label>
      </Modal>
      <RemoveStudentDialog
        student={removing && { id: r.student.id, name: fullName(r.student.user) }}
        onClose={() => setRemoving(null)}
        sectionId={removing?.courseSectionId}
        sectionLabel={removing ? `${removing.section.course.code} section ${removing.section.sectionCode}` : ''}
      />
    </div>
  )
}
