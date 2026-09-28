import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, MailPlus, X } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Button, Card, CardHeader, ErrorState, Loading, Select, StatusBadge } from '../../components/ui'
import FormModal, { Textarea } from '../../components/admin/FormModal'
import { APPLICATION_STATUS, formatDate, formatDateTime, fullName } from '../../lib/format'
import { optionalNumber } from '../../lib/forms'

const admitSchema = z.object({ level: optionalNumber(z.number().int().min(100)) })
const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() })

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children || '—'}</dd>
    </div>
  )
}

export default function ApplicationDetail() {
  const { id } = useParams()
  const application = useApi(`/applications/${id}`)
  const [deciding, setDeciding] = useState(null)
  const admit = useApiMutation((body) => http.post(`/applications/${id}/admit`, body), {
    success: (a) => `Admitted as ${a.student?.studentNumber}. The activation link was emailed to ${a.personalEmail}.`,
  })
  const reject = useApiMutation((body) => http.post(`/applications/${id}/reject`, body), { success: 'Applicant notified of the decision' })
  const resend = useApiMutation(() => http.post(`/applications/${id}/resend-activation`), { success: (d) => d.message })

  if (application.isPending) return <Loading />
  if (application.isError) return <ErrorState error={application.error} onRetry={() => application.refetch()} />
  const a = application.data
  const [tone, label] = APPLICATION_STATUS[a.status]
  const levels = Array.from({ length: a.program?.durationYears ?? 0 }, (_, i) => (i + 1) * 100)
  const awaitingActivation = a.status === 'admitted' && a.user?.status === 'pending'

  return (
    <div className="space-y-6">
      <Link to="/staff/applications" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Back to applications
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{[a.firstName, a.otherNames, a.lastName].filter(Boolean).join(' ')}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{a.personalEmail}</p>
            <div className="mt-2"><StatusBadge status={a.status} tone={tone} label={label} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {a.status === 'submitted' && (
              <>
                <Button variant="secondary" className="text-red-600" onClick={() => setDeciding('reject')}><X className="size-4" /> Reject</Button>
                <Button onClick={() => setDeciding('admit')}><Check className="size-4" /> Admit</Button>
              </>
            )}
            {awaitingActivation && (
              <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate()}><MailPlus className="size-4" /> Resend activation link</Button>
            )}
          </div>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="Date of birth">{formatDate(a.dateOfBirth)}</Field>
          <Field label="Phone">{a.phone}</Field>
          <Field label="Department">{a.department?.name}</Field>
          <Field label="Programme">{a.program?.name}</Field>
          <Field label="Entry level">{a.entryLevel && `Level ${a.entryLevel}`}</Field>
          <Field label="Submitted">{formatDateTime(a.submittedAt)}</Field>
          {a.reviewedAt && <Field label="Decided">{`${formatDateTime(a.reviewedAt)}${a.reviewer ? ` by ${fullName(a.reviewer)}` : ''}`}</Field>}
          {a.student && <Field label="Student ID">{a.student.studentNumber}</Field>}
          {a.status === 'admitted' && <Field label="Account">{awaitingActivation ? 'Waiting for activation' : 'Activated'}</Field>}
        </dl>
        {a.rejectionReason && (
          <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-800"><span className="font-medium">Reason given:</span> {a.rejectionReason}</p>
        )}
      </Card>

      {a.status === 'submitted' && (
        <Card>
          <CardHeader title="What admitting does" />
          <ul className="list-disc space-y-1 py-4 pr-5 pl-10 text-sm text-slate-600">
            <li>Creates the student record for {a.program?.name}, with a new Student ID and school email.</li>
            <li>Emails {a.personalEmail} a single-use activation link (valid for a limited time) to choose their PIN.</li>
            <li>Ends the applicant account; from then on they sign in with their Student ID.</li>
          </ul>
        </Card>
      )}

      <FormModal
        open={deciding === 'admit'}
        onClose={() => setDeciding(null)}
        title={`Admit ${a.firstName} ${a.lastName}`}
        schema={admitSchema}
        defaultValues={{ level: a.entryLevel ?? '' }}
        onSubmit={(v) => admit.mutateAsync(v.level ? { level: v.level } : {})}
        submitLabel="Admit"
      >
        {({ register, formState: { errors } }) => (
          <>
            <p className="text-sm text-slate-600">Admit to <span className="font-medium">{a.program?.name}</span>. You can adjust the entry level they applied for.</p>
            <Select label="Entry level" error={errors.level?.message} {...register('level')}>
              {levels.map((l) => <option key={l} value={l}>Level {l}{l === a.entryLevel ? ' (applied for)' : ''}</option>)}
            </Select>
          </>
        )}
      </FormModal>

      <FormModal
        open={deciding === 'reject'}
        onClose={() => setDeciding(null)}
        title="Reject application"
        schema={rejectSchema}
        defaultValues={{ reason: '' }}
        onSubmit={(v) => reject.mutateAsync(v.reason ? { reason: v.reason } : {})}
        submitLabel="Reject"
      >
        {({ register, formState: { errors } }) => (
          <>
            <p className="text-sm text-slate-600">{a.firstName} will be emailed the decision, with your reason if you give one. This is final.</p>
            <Textarea label="Reason (optional)" error={errors.reason?.message} {...register('reason')} />
          </>
        )}
      </FormModal>
    </div>
  )
}
