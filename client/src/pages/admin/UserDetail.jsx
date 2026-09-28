import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, BookOpen, GraduationCap, Laptop, Mail, Pencil, Plus, ShieldOff, ShieldCheck, Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, Loading, QueryState, Select, Tabs, userMessage } from '../../components/ui'
import SignInTable from '../../components/admin/SignInTable'
import FormModal, { Checkbox } from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { describeDevice, formatDateTime, fullName } from '../../lib/format'
import { requiredNumber } from '../../lib/forms'
import { PERMS, ROLE_LABELS, can } from '../../lib/roles'
import { STUDENT_TONE } from './Students'
import { USER_TONE } from './Users'

const ROLE_ORDER = ['USER', 'LECTURER', 'ACADEMIC_ADVISOR', 'REGISTRAR', 'ADMIN', 'SUPER_ADMIN']

const accountSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  role: z.enum(ROLE_ORDER),
  status: z.enum(['active', 'suspended', 'pending']),
})

const studentSchema = z.object({
  programId: requiredNumber(z.number().int().positive('Choose a program'), 'Choose a program'),
  level: requiredNumber(z.number().int().min(100).max(900)),
  status: z.enum(['active', 'probation', 'suspended', 'graduated']),
  academicHold: z.boolean(),
  studentNumber: z.string().trim().max(30).optional(),
})

const lecturerSchema = z.object({
  departmentId: requiredNumber(z.number().int().positive('Choose a department'), 'Choose a department'),
  staffNumber: z.string().trim().min(2, 'At least 2 characters').max(30),
  title: z.string().trim().max(50).optional(),
})

function Row({ label, children }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{children ?? '—'}</dd>
    </div>
  )
}

/** The user's recent sign-ins (time, device, IP), from the audit log. */
function SignInHistory({ userId, email }) {
  const signIns = useApi('/admin/sign-ins', { userId, limit: 20 })
  return (
    <Card>
      <CardHeader
        title="Sign-in history"
        subtitle="The last 20 sign-ins and failed attempts."
        action={<Link to={`/staff/sign-ins?search=${encodeURIComponent(email)}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">All sign-ins</Link>}
      />
      <QueryState query={signIns}>{({ items }) => <SignInTable rows={items} showPerson={false} />}</QueryState>
    </Card>
  )
}

/** Devices the user is signed in on right now; an admin can sign one out. */
function UserDevices({ userId }) {
  const devices = useApi(`/users/${userId}/sessions`)
  const end = useApiMutation((sessionId) => http.delete(`/users/${userId}/sessions/${sessionId}`), { success: 'That device has been signed out' })
  return (
    <Card>
      <CardHeader title="Signed in now" subtitle="Each device where this person is currently signed in." />
      <QueryState query={devices}>
        {(rows) => (rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((d) => {
              const device = describeDevice(d.userAgent)
              const Icon = device.mobile ? Smartphone : Laptop
              return (
                <li key={d.id} className="flex items-center gap-4 px-5 py-3 text-sm">
                  <Icon className="size-5 shrink-0 text-slate-400" />
                  <div className="flex-1">
                    <p className="font-medium">{device.label}</p>
                    <p className="text-slate-500">{d.ipAddress ?? 'Unknown IP'} · last active {formatDateTime(d.lastActiveAt)}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-600" loading={end.isPending && end.variables === d.id} onClick={() => end.mutate(d.id)}>Sign out</Button>
                </li>
              )
            })}
          </ul>
        ) : <EmptyState title="Not signed in anywhere" />)}
      </QueryState>
    </Card>
  )
}

export default function UserDetail() {
  const { id } = useParams()
  const { user: me } = useAuth()
  const user = useApi(`/users/${id}`)
  const programs = useApi('/programs')
  const departments = useApi('/departments')
  const [editing, setEditing] = useState(null)
  const [toggling, setToggling] = useState(false)
  const [tab, setTab] = useState('overview')

  const updateAccount = useApiMutation((body) => http.patch(`/users/${id}`, body), { success: 'Account updated' })
  const suspend = useApiMutation(() => http.delete(`/users/${id}`), { success: 'Account suspended' })
  const reactivate = useApiMutation(() => http.patch(`/users/${id}`, { status: 'active' }), { success: 'Account reactivated' })
  // 409 once they have set a password; the server decides, since the password itself is never exposed.
  const invite = useApiMutation(() => http.post(`/users/${id}/invite`), { success: 'Invite sent' })
  const saveStudent = useApiMutation(({ studentId, studentNumber, ...body }) => (studentId
    ? http.patch(`/students/${studentId}`, body)
    : http.post('/students', { ...body, userId: Number(id), ...(studentNumber ? { studentNumber } : {}) })), { success: 'Student record saved' })
  const saveLecturer = useApiMutation(({ lecturerId, ...body }) => (lecturerId
    ? http.patch(`/lecturers/${lecturerId}`, body)
    : http.post('/lecturers', { ...body, userId: Number(id) })), { success: 'Lecturer record saved' })

  if (user.isPending) return <Loading />
  if (user.isError) return <ErrorState error={user.error} onRetry={() => user.refetch()} />
  const u = user.data
  const role = u.role?.name
  const self = me?.id === u.id
  const active = u.status === 'active'
  const showStudent = role === 'USER' || u.student
  const showLecturer = role === 'LECTURER' || u.lecturer
  const showSignIns = can(me, PERMS.AUDIT_VIEW)
  const tabs = [
    { value: 'overview', label: 'Overview' },
    ...(showStudent ? [{ value: 'student', label: 'Student record' }] : []),
    ...(showLecturer ? [{ value: 'lecturer', label: 'Lecturer record' }] : []),
    ...(showSignIns ? [{ value: 'signins', label: 'Sign-in history' }] : []),
    { value: 'devices', label: 'Devices' },
  ]

  return (
    <div className="space-y-6">
      <Link to="/staff/users" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Users
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{fullName(u)} {self && <Badge tone="blue">You</Badge>}</h1>
            <p className="mt-1 text-sm text-slate-500">{u.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Students sign in with the PIN from admission; invites are for staff. */}
            {!self && active && !u.lastLoginAt && role !== 'USER' && (
              <Button
                variant="secondary"
                loading={invite.isPending}
                onClick={() => invite.mutate(undefined, { onError: (err) => toast.error(userMessage(err)) })}
              >
                <Mail className="size-4" /> Send invite
              </Button>
            )}
            {!self && (
              <Button variant="secondary" className={active ? 'text-red-600' : ''} onClick={() => setToggling(true)}>
                {active ? <><ShieldOff className="size-4" /> Suspend</> : <><ShieldCheck className="size-4" /> Reactivate</>}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing('account')}><Pencil className="size-4" /> Edit</Button>
          </div>
        </div>
      </Card>

      <Tabs variant="underline" items={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <Card>
          <CardHeader title="Account overview" />
          <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-5">
            <Row label="Role">{ROLE_LABELS[role]}</Row>
            <Row label="Status"><Badge tone={USER_TONE[u.status]}>{u.status}</Badge></Row>
            <Row label="Email">{u.emailVerifiedAt ? <Badge tone="green">verified</Badge> : <Badge tone="amber">not verified</Badge>}</Row>
            <Row label="Last sign-in">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</Row>
            <Row label="Created">{formatDateTime(u.createdAt)}</Row>
          </dl>
        </Card>
      )}

      {tab === 'student' && showStudent && (
        <Card>
          <CardHeader
            title="Student record"
            action={u.student
              ? (
                <div className="flex gap-2">
                  <Link to={`/staff/students/${u.student.id}`}><Button size="sm" variant="secondary">Results & waivers</Button></Link>
                  <Button size="sm" variant="secondary" onClick={() => setEditing('student')}><Pencil className="size-4" /> Edit</Button>
                </div>
              )
              : <Button size="sm" onClick={() => setEditing('student')}><Plus className="size-4" /> Add student record</Button>}
          />
          {u.student ? (
            <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-5">
              <Row label="Student no.">{u.student.studentNumber}</Row>
              <Row label="Program">{u.student.program?.name}</Row>
              <Row label="Level">{u.student.level}</Row>
              <Row label="Status"><Badge tone={STUDENT_TONE[u.student.status]}>{u.student.status}</Badge></Row>
              <Row label="Academic hold">{u.student.academicHold ? <Badge tone="red">On hold</Badge> : 'None'}</Row>
            </dl>
          ) : (
            <EmptyState title="No student record" icon={GraduationCap}>
              This account has no student record, so it can't register for courses.
              <div className="mt-3"><Button size="sm" onClick={() => setEditing('student')}><Plus className="size-4" /> Add student record</Button></div>
            </EmptyState>
          )}
        </Card>
      )}

      {tab === 'lecturer' && showLecturer && (
        <Card>
          <CardHeader
            title="Lecturer record"
            action={u.lecturer
              ? <Button size="sm" variant="secondary" onClick={() => setEditing('lecturer')}><Pencil className="size-4" /> Edit</Button>
              : <Button size="sm" onClick={() => setEditing('lecturer')}><Plus className="size-4" /> Add lecturer record</Button>}
          />
          {u.lecturer ? (
            <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
              <Row label="Title">{u.lecturer.title}</Row>
              <Row label="Department">{u.lecturer.department?.name}</Row>
              <Row label="Staff no.">{u.lecturer.staffNumber}</Row>
            </dl>
          ) : (
            <EmptyState title="No lecturer record" icon={BookOpen}>
              This lecturer has no lecturer record, so they can't be assigned to sections.
              <div className="mt-3"><Button size="sm" onClick={() => setEditing('lecturer')}><Plus className="size-4" /> Add lecturer record</Button></div>
            </EmptyState>
          )}
        </Card>
      )}

      {tab === 'signins' && showSignIns && <SignInHistory userId={u.id} email={u.email} />}
      {tab === 'devices' && <UserDevices userId={u.id} />}

      <FormModal
        open={editing === 'account'}
        onClose={() => setEditing(null)}
        title="Edit account"
        schema={accountSchema}
        defaultValues={{ firstName: u.firstName, lastName: u.lastName, role, status: u.status }}
        onSubmit={(v) => updateAccount.mutateAsync(v)}
      >
        {({ register, watch, formState: { errors } }) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Role" disabled={self} {...register('role')}>
                {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
              <Select label="Status" disabled={self} {...register('status')}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
              </Select>
            </div>
            {(watch('role') !== role || (watch('status') !== 'active' && watch('status') !== u.status)) && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Changing the role or suspending the account signs this person out on every device.</p>
            )}
          </>
        )}
      </FormModal>

      <FormModal
        open={editing === 'student'}
        onClose={() => setEditing(null)}
        title={u.student ? 'Edit student record' : 'Add student record'}
        schema={studentSchema}
        defaultValues={{
          programId: u.student?.programId ?? '', level: u.student?.level ?? 100, status: u.student?.status ?? 'active',
          academicHold: u.student?.academicHold ?? false, studentNumber: '',
        }}
        onSubmit={({ status, academicHold, ...v }) => saveStudent.mutateAsync(u.student
          ? { studentId: u.student.id, programId: v.programId, level: v.level, status, academicHold }
          : { programId: v.programId, level: v.level, studentNumber: v.studentNumber })}
      >
        {({ register, formState: { errors } }) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Program" error={errors.programId?.message} {...register('programId')}>
                <option value="">Select program</option>
                {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <Input label="Level" type="number" step={100} hint="Decides which course levels they can take" error={errors.level?.message} {...register('level')} />
            </div>
            {u.student ? (
              <>
                <Select label="Status" {...register('status')}>
                  <option value="active">Active</option>
                  <option value="probation">Probation — can still register</option>
                  <option value="suspended">Suspended — can't register</option>
                  <option value="graduated">Graduated</option>
                </Select>
                <Checkbox label="Academic hold" hint="Blocks registration until the hold is lifted" {...register('academicHold')} />
              </>
            ) : (
              <Input label="Student number (optional)" hint="Generated if left empty" error={errors.studentNumber?.message} {...register('studentNumber')} />
            )}
          </>
        )}
      </FormModal>

      <FormModal
        open={editing === 'lecturer'}
        onClose={() => setEditing(null)}
        title={u.lecturer ? 'Edit lecturer record' : 'Add lecturer record'}
        schema={lecturerSchema}
        defaultValues={{ departmentId: u.lecturer?.departmentId ?? '', staffNumber: u.lecturer?.staffNumber ?? '', title: u.lecturer?.title ?? '' }}
        onSubmit={(v) => saveLecturer.mutateAsync({ lecturerId: u.lecturer?.id, ...v, title: v.title || undefined })}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Select label="Department" error={errors.departmentId?.message} {...register('departmentId')}>
              <option value="">Select department</option>
              {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Staff number" error={errors.staffNumber?.message} {...register('staffNumber')} />
              <Input label="Title (optional)" placeholder="e.g. Dr." error={errors.title?.message} {...register('title')} />
            </div>
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={toggling}
        onClose={() => setToggling(false)}
        title={active ? `Suspend ${fullName(u)}?` : `Reactivate ${fullName(u)}?`}
        confirmLabel={active ? 'Suspend' : 'Reactivate'}
        danger={active}
        onConfirm={() => (active ? suspend.mutateAsync() : reactivate.mutateAsync())}
      >
        <p>{active ? 'They are signed out everywhere and can’t sign in. Their records are kept.' : 'They can sign in again.'}</p>
      </ConfirmDialog>
    </div>
  )
}
