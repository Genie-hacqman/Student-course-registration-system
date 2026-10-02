import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { CheckCircle2, Clock, ImageOff, MailWarning, Send, XCircle } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useApplicationOptions, useMyApplication, useSaveApplication, useSubmitApplication } from '../../api/applications'
import { Button, Card, CardHeader, Input, PageHeader, QueryState, Select, StatusBadge } from '../../components/ui'
import AvatarUploader from '../../components/account/AvatarUploader'
import { applyServerErrors, requiredNumber } from '../../lib/forms'
import { APPLICATION_STATUS, formatDate, formatDateTime } from '../../lib/format'
import { isAdmitted } from '../../lib/roles'

// Mirrors SCRS-backend validators/application.validator.js; completeness is checked again on submit.
const schema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  otherNames: z.string().trim().max(100).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth'),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number'),
  departmentId: requiredNumber(z.number().int().positive(), 'Choose a department'),
  programId: requiredNumber(z.number().int().positive(), 'Choose a programme'),
  entryLevel: requiredNumber(z.number().int().min(100), 'Choose an entry level'),
})
const FIELDS = Object.keys(schema.shape)

const toForm = (a) => ({
  firstName: a?.firstName ?? '', lastName: a?.lastName ?? '', otherNames: a?.otherNames ?? '', dateOfBirth: a?.dateOfBirth ?? '',
  phone: a?.phone ?? '', departmentId: a?.departmentId ?? '', programId: a?.programId ?? '', entryLevel: a?.entryLevel ?? '',
})

/** Drops empty fields (a draft may be partial) and turns the selects into numbers. */
const toBody = (values) => Object.fromEntries(Object.entries(values)
  .filter(([, v]) => v !== '' && v != null)
  .map(([k, v]) => [k, ['departmentId', 'programId', 'entryLevel'].includes(k) ? Number(v) : v]))

/**
 * Admission status for every STUDENT. Before admission: the application form, then its progress.
 * Once admitted (online or by staff): the student record, with the way into course registration.
 */
export default function Admission() {
  const { user } = useAuth()
  const mine = useMyApplication()
  const admitted = isAdmitted(user)
  return (
    <div className="space-y-6">
      <PageHeader
        title="Admission status"
        subtitle={admitted ? 'You are admitted. Your student record is below.' : 'Apply for admission, then follow your application\'s progress here.'}
      />
      {admitted && <AdmittedCard student={user.student} email={user.email} />}
      <QueryState query={mine}>
        {({ application, emailVerified }) => {
          if (admitted) return application ? <ApplicationStatus application={application} /> : null
          return application && application.status !== 'draft'
            ? <ApplicationStatus application={application} />
            : <ApplicationForm application={application} emailVerified={emailVerified} />
        }}
      </QueryState>
    </div>
  )
}

function AdmittedCard({ student, email }) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="mt-0.5 size-8 shrink-0 text-green-600" aria-hidden />
          <div className="space-y-1">
            <StatusBadge status="approved" tone="green" label="Admitted" />
            <h2 className="text-lg font-semibold text-slate-900">Course registration is open to you</h2>
            <p className="text-sm text-slate-600">Register for the courses on your programme during the registration period.</p>
          </div>
        </div>
        <Link to="/student/registration"><Button>Go to course registration</Button></Link>
      </div>
      <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
        <Item label="Student ID">{student?.studentNumber}</Item>
        <Item label="School email">{email}</Item>
        <Item label="Programme">{student?.program?.name}</Item>
        <Item label="Department">{student?.program?.department?.name}</Item>
        <Item label="Level">{student?.level && `Level ${student.level}`}</Item>
      </dl>
    </Card>
  )
}

function ApplicationForm({ application, emailVerified }) {
  const { user } = useAuth()
  const options = useApplicationOptions()
  const save = useSaveApplication()
  const submit = useSubmitApplication()
  // Depend on the name strings, not the `user` object: it is replaced whenever the profile changes (e.g. after
  // uploading the photo), and a new `defaults` resets the form, which would wipe what the applicant has typed.
  const { firstName, lastName } = user ?? {}
  const defaults = useMemo(() => toForm(application ?? { firstName, lastName }), [application, firstName, lastName])
  const { register, handleSubmit, getValues, setValue, watch, setError, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema), defaultValues: defaults,
  })
  useEffect(() => reset(defaults), [defaults, reset])

  const hasPhoto = Boolean(user?.avatar)
  const departments = options.data ?? []
  const departmentId = Number(watch('departmentId')) || null
  const programId = Number(watch('programId')) || null
  const programs = departments.find((d) => d.id === departmentId)?.programs ?? []
  const program = programs.find((p) => p.id === programId)

  const onError = (err) => applyServerErrors(err, setError, FIELDS)
  const saveDraft = () => save.mutate(toBody(getValues()), { onSuccess: () => toast.success('Draft saved'), onError })
  const onSubmit = async (values) => {
    try {
      await save.mutateAsync(toBody(values))
      await submit.mutateAsync()
      toast.success('Application submitted')
    } catch (err) {
      onError(err)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-6">
      <Card>
        <CardHeader title="Passport photo" subtitle="Required. Your photo goes on your student record and is seen by the admissions office." />
        <div className="px-5 py-4"><AvatarUploader required /></div>
      </Card>

      <Card>
        <CardHeader title="Personal details" subtitle={`Decisions are sent to ${user?.email}.`} />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
          <Input label="Other names (optional)" error={errors.otherNames?.message} {...register('otherNames')} />
          <Input label="Date of birth" type="date" error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
          <Input label="Phone number" type="tel" autoComplete="tel" placeholder="+233 24 123 4567" error={errors.phone?.message} {...register('phone')} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Programme choice" subtitle="Choose from the programmes currently offered." />
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
          <Select
            label="Department" error={errors.departmentId?.message}
            {...register('departmentId', { onChange: () => { setValue('programId', ''); setValue('entryLevel', '') } })}
          >
            <option value="">{options.isLoading ? 'Loading…' : 'Choose…'}</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select
            label="Programme" disabled={!departmentId} error={errors.programId?.message}
            {...register('programId', { onChange: () => setValue('entryLevel', '') })}
          >
            <option value="">Choose…</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.qualificationCode ? ` (${p.qualificationCode})` : ''}</option>)}
          </Select>
          <Select label="Entry level" disabled={!program} error={errors.entryLevel?.message} {...register('entryLevel')}>
            <option value="">Choose…</option>
            {program?.levels.map((l) => <option key={l} value={l}>Level {l}</option>)}
          </Select>
        </div>
      </Card>

      {!emailVerified && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <MailWarning className="mt-0.5 size-4 shrink-0" />
          Confirm your email address (see the link we sent you) before submitting — that's where your admission decision will go.
        </p>
      )}

      {!hasPhoto && (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <ImageOff className="mt-0.5 size-4 shrink-0" />
          Add your passport photo above before submitting. You can still save a draft without it.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" loading={save.isPending && !submit.isPending} onClick={saveDraft}>Save draft</Button>
        <Button type="submit" disabled={!emailVerified || !hasPhoto} loading={submit.isPending}><Send className="size-4" /> Submit application</Button>
      </div>
      <p className="text-right text-xs text-slate-500">Once submitted, your application can no longer be changed.</p>
    </form>
  )
}

const HEADLINE = {
  submitted: { icon: Clock, tone: 'text-amber-600', title: 'Your application is under review', body: "We'll email you at your personal address as soon as a decision is made." },
  admitted: { icon: CheckCircle2, tone: 'text-green-600', title: 'Congratulations — you have been admitted!', body: 'We emailed your Student ID and an activation link to your personal email. Activate your account there, then sign in with your Student ID and PIN.' },
  rejected: { icon: XCircle, tone: 'text-red-600', title: 'Your application was not successful', body: 'Thank you for applying. The reason, if one was given, is shown below.' },
}

function ApplicationStatus({ application: a }) {
  const head = HEADLINE[a.status]
  const [tone, label] = APPLICATION_STATUS[a.status]
  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex items-start gap-4">
          <head.icon className={`mt-0.5 size-8 shrink-0 ${head.tone}`} aria-hidden />
          <div className="space-y-1">
            <StatusBadge status={a.status} tone={tone} label={label} />
            <h2 className="text-lg font-semibold text-slate-900">{head.title}</h2>
            <p className="text-sm text-slate-600">{head.body}</p>
            {a.status === 'rejected' && a.rejectionReason && (
              <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"><span className="font-medium">Reason:</span> {a.rejectionReason}</p>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="What you applied for" />
        <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
          <Item label="Name">{[a.firstName, a.otherNames, a.lastName].filter(Boolean).join(' ')}</Item>
          <Item label="Date of birth">{formatDate(a.dateOfBirth)}</Item>
          <Item label="Phone">{a.phone}</Item>
          <Item label="Department">{a.department?.name}</Item>
          <Item label="Programme">{a.program?.name}</Item>
          <Item label="Entry level">Level {a.entryLevel}</Item>
          <Item label="Submitted">{formatDateTime(a.submittedAt)}</Item>
          {a.reviewedAt && <Item label="Decided">{formatDateTime(a.reviewedAt)}</Item>}
        </dl>
      </Card>
    </div>
  )
}

const Item = ({ label, children }) => (
  <div>
    <dt className="text-slate-500">{label}</dt>
    <dd className="font-medium text-slate-900">{children || '—'}</dd>
  </div>
)
