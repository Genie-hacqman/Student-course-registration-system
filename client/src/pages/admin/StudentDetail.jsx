import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, KeyRound, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Badge, Button, Card, CardHeader, ErrorState, Loading, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Textarea } from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import CredentialsDialog from '../../components/admin/CredentialsDialog'
import { CoursePicker } from '../../components/admin/Pickers'
import { formatDate, fullName } from '../../lib/format'
import { optionalNumber, requiredNumber } from '../../lib/forms'
import { can, PERMS } from '../../lib/roles'
import { STUDENT_TONE } from './Students'
import { GRADES } from '../../components/GradeSheet'

const waiverSchema = z.object({
  courseId: requiredNumber(z.number().int().positive('Choose a course'), 'Choose a course'),
  semesterId: optionalNumber(z.number().int().positive()),
  reason: z.string().trim().min(5, 'At least 5 characters').max(500),
})

const amendSchema = z.object({
  grade: z.enum(GRADES),
  reason: z.string().trim().min(5, 'At least 5 characters').max(500),
})

/** Every result, provisional included. The registry can amend one with a reason (kept in the audit log). */
function StudentResults({ studentId, canAmend }) {
  const results = useApi(`/students/${studentId}/results`)
  const amend = useApiMutation(({ id, ...body }) => http.patch(`/results/${id}`, body), { success: 'Grade amended — the student has been notified' })
  const [amending, setAmending] = useState(null)
  const summary = results.data?.summary

  return (
    <Card>
      <CardHeader
        title="Results"
        subtitle={summary && `GPA ${summary.gpa ?? '—'} · ${summary.creditsEarned} of ${summary.creditsAttempted} credits earned (final results only)`}
      />
      <DataTable
        rows={results.data?.results ?? []}
        empty="No results yet"
        columns={[
          { key: 'course', header: 'Course', render: (r) => <><span className="font-medium">{r.course?.code}</span> <span className="text-slate-500">{r.course?.title}</span></> },
          { key: 'semester', header: 'Semester', render: (r) => r.semester?.name ?? '—' },
          { key: 'grade', header: 'Grade', render: (r) => <span className="font-semibold">{r.grade}</span> },
          { key: 'status', header: 'Status', render: (r) => <Badge tone={r.status === 'final' ? 'green' : 'slate'}>{r.status}</Badge> },
          { key: 'actions', header: '', className: 'text-right', render: (r) => canAmend && <Button size="sm" variant="ghost" onClick={() => setAmending(r)}>Amend</Button> },
        ]}
      />
      <FormModal
        open={Boolean(amending)}
        onClose={() => setAmending(null)}
        title={`Amend ${amending?.course?.code} grade`}
        schema={amendSchema}
        defaultValues={{ grade: amending?.grade ?? 'A', reason: '' }}
        onSubmit={(v) => amend.mutateAsync({ id: amending.id, ...v })}
        submitLabel="Amend grade"
      >
        {({ register, formState: { errors } }) => (
          <>
            <Select label={`New grade (currently ${amending?.grade})`} {...register('grade')}>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
            <Textarea label="Reason" placeholder="e.g. Marking error on the final exam, confirmed by the department" error={errors.reason?.message} {...register('reason')} />
            {amending?.status === 'final' && <p className="text-xs text-slate-500">The student is notified of the change.</p>}
          </>
        )}
      </FormModal>
    </Card>
  )
}

export default function StudentDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const student = useApi(`/students/${id}`)
  const waivers = useApi(`/students/${id}/prerequisite-overrides`)
  const current = useApi('/semesters/current')
  const [adding, setAdding] = useState(false)
  const [revoking, setRevoking] = useState(null)
  const [resettingPin, setResettingPin] = useState(false)
  const [newPin, setNewPin] = useState(null)
  const canWaive = can(user, 'prerequisite:override')
  const canResetPin = can(user, PERMS.STUDENT_ADMIT)
  const resetPin = useApiMutation(() => http.post(`/students/${id}/reset-pin`))

  const grant = useApiMutation((body) => http.post(`/students/${id}/prerequisite-overrides`, body), { success: 'Waiver granted — the student has been notified' })
  const revoke = useApiMutation((overrideId) => http.delete(`/students/${id}/prerequisite-overrides/${overrideId}`), { success: 'Waiver revoked' })

  if (student.isPending) return <Loading />
  if (student.isError) return <ErrorState error={student.error} onRetry={() => student.refetch()} />
  const s = student.data

  return (
    <div className="space-y-6">
      <Link to="/staff/students" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Students
      </Link>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{fullName(s.user)}</h1>
            <p className="mt-1 text-sm break-all text-slate-500">{s.user?.email}</p>
          </div>
          {canResetPin && (
            <Button variant="secondary" onClick={() => setResettingPin(true)}><KeyRound className="size-4" /> Reset PIN</Button>
          )}
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <div><dt className="text-slate-500">Student no.</dt><dd className="font-medium">{s.studentNumber}</dd></div>
          <div>
            <dt className="text-slate-500">Programme</dt>
            <dd className="font-medium">{s.program?.name}{s.program?.qualificationCode && <span className="text-slate-500"> · {s.program.qualificationCode}</span>}</dd>
            {s.program?.department && <dd className="text-xs text-slate-500">{s.program.department.name}</dd>}
          </div>
          <div><dt className="text-slate-500">Level</dt><dd className="font-medium">{s.level}</dd></div>
          <div><dt className="text-slate-500">Status</dt><dd><Badge tone={STUDENT_TONE[s.status]}>{s.status}</Badge> {s.academicHold && <Badge tone="red">Academic hold</Badge>}</dd></div>
          <div>
            <dt className="text-slate-500">Admitted</dt>
            <dd className="font-medium">{s.admissionSession ?? s.admissionYear ?? '—'}</dd>
            {s.admissionNumber && <dd className="text-xs text-slate-500">Adm. no. {s.admissionNumber}</dd>}
          </div>
        </dl>
        <div className="mt-4 flex gap-4 text-sm font-medium">
          <Link to={`/staff/registrations?status=&student=${s.id}`} className="text-brand-600 hover:text-brand-700">View registrations</Link>
          {can(user, 'user:manage') && <Link to={`/staff/users/${s.userId}`} className="text-brand-600 hover:text-brand-700">Account, level & status</Link>}
        </div>
      </Card>

      <StudentResults studentId={id} canAmend={can(user, 'grade:manage')} />

      <Card>
        <CardHeader
          title="Prerequisite waivers"
          subtitle="A waiver lets this student register for a course without meeting its prerequisites."
          action={canWaive && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Grant waiver</Button>}
        />
        <DataTable
          rows={waivers.data ?? []}
          empty="No waivers"
          columns={[
            { key: 'course', header: 'Course', render: (w) => <><span className="font-medium">{w.course?.code}</span> <span className="text-slate-500">{w.course?.title}</span></> },
            { key: 'semester', header: 'Applies to', render: (w) => w.semester?.name ?? <Badge tone="blue">Permanent</Badge> },
            { key: 'reason', header: 'Reason', className: 'max-w-xs', render: (w) => <span className="text-slate-600">{w.reason}</span> },
            { key: 'createdAt', header: 'Granted', render: (w) => formatDate(w.createdAt) },
            { key: 'actions', header: '', className: 'text-right', render: (w) => canWaive && <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Revoke ${w.course?.code}`} onClick={() => setRevoking(w)}><Trash2 className="size-4" /></Button> },
          ]}
        />
      </Card>

      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title={`Grant a waiver to ${s.user?.firstName}`}
        schema={waiverSchema}
        defaultValues={{ courseId: '', semesterId: current.data?.id ?? '', reason: '' }}
        onSubmit={(v) => grant.mutateAsync(v)}
        submitLabel="Grant waiver"
      >
        {({ control, register, formState: { errors } }) => (
          <>
            <Controller
              name="courseId"
              control={control}
              render={({ field }) => <CoursePicker label="Course" value={field.value} onChange={(v) => field.onChange(v ?? '')} error={errors.courseId?.message} />}
            />
            <Select label="Applies to" {...register('semesterId')}>
              {current.data && <option value={current.data.id}>{current.data.name} only</option>}
              <option value="">Permanently</option>
            </Select>
            <Textarea label="Reason" placeholder="e.g. Equivalent course completed at a previous university" error={errors.reason?.message} {...register('reason')} />
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={resettingPin}
        onClose={() => setResettingPin(false)}
        title={`Reset ${s.user?.firstName}'s PIN?`}
        confirmLabel="Reset PIN"
        onConfirm={async () => setNewPin(await resetPin.mutateAsync())}
      >
        <p>A new temporary PIN is created and shown once. {s.user?.firstName} is signed out on every device and must choose a new PIN at the next sign-in.</p>
        <p className="mt-2">If they can still read their school email, “Forgot PIN” on the sign-in page lets them do this themselves.</p>
      </ConfirmDialog>
      <CredentialsDialog open={Boolean(newPin)} onClose={() => setNewPin(null)} credentials={newPin} name={fullName(s.user)} title="New temporary PIN" />

      <ConfirmDialog open={Boolean(revoking)} onClose={() => setRevoking(null)} title={`Revoke the ${revoking?.course?.code} waiver?`} confirmLabel="Revoke" onConfirm={() => revoke.mutateAsync(revoking.id)}>
        <p>The prerequisite applies again the next time {s.user?.firstName} adds or submits. Courses already registered stay registered.</p>
      </ConfirmDialog>
    </div>
  )
}
