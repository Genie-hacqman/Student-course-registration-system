import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { UserPlus, X } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, Input, PageHeader, SearchInput, Select } from '../../components/ui'
import FormModal from '../../components/admin/FormModal'
import CredentialsDialog from '../../components/admin/CredentialsDialog'
import StudentTable, { STUDENT_TONE } from '../../components/directory/StudentTable'
import DepartmentOverview from '../../components/directory/DepartmentOverview'
import { SemesterSelect, useSemesterParam } from '../../components/staff'
import { REGISTRATION_STATUS, fullName } from '../../lib/format'
import { can, PERMS } from '../../lib/roles'
import { optionalNumber } from '../../lib/forms'

export { STUDENT_TONE }

const SESSION = /^\d{4}\/\d{4}$/

const admitSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  programId: z.coerce.number({ message: 'Choose a programme' }).int().positive('Choose a programme'),
  admissionSession: z.string().trim()
    .regex(SESSION, 'Like 2026/2027')
    .refine((s) => Number(s.slice(5)) === Number(s.slice(0, 4)) + 1, 'The second year must follow the first'),
  level: optionalNumber(z.number().int().min(100).max(900)),
  admissionNumber: z.string().trim().max(30).optional(),
})

/** The academic year holding the current semester, else the latest one, else the calendar's guess. */
const defaultSession = (years) => {
  const current = years?.find((y) => y.semesters?.some((s) => s.isCurrent)) ?? years?.[0]
  if (current && SESSION.test(current.name)) return current.name
  const now = new Date()
  const start = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1 // sessions usually start around August
  return `${start}/${start + 1}`
}

/**
 * Admission: the school creates the account (Student ID, school email, temporary PIN). The PIN is
 * returned once, so the credentials dialog opens straight after.
 */
function AdmitStudent({ open, onClose, onAdmitted }) {
  // Only open programmes take new students (archived ones are closed to intake).
  const programs = useApi(open ? '/programs' : null, { status: 'active' })
  const years = useApi(open ? '/academic-years' : null)
  const admit = useApiMutation(({ level, admissionNumber, ...v }) => http.post('/admissions', {
    ...v, level: level ?? 100, ...(admissionNumber ? { admissionNumber } : {}),
  }))

  if (open && years.isPending) return null // wait for the session default before building the form
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Admit student"
      schema={admitSchema}
      defaultValues={{ firstName: '', lastName: '', programId: '', admissionSession: defaultSession(years.data), level: 100, admissionNumber: '' }}
      submitLabel="Admit and create account"
      onSubmit={async (v) => onAdmitted(await admit.mutateAsync(v))}
      onError={(err) => {
        if (!/studentEmailDomain/.test(err.message)) return false
        toast.error('Set the student email domain in System settings first (e.g. school.edu.gh).')
        return true
      }}
    >
      {({ register, formState: { errors } }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
          </div>
          <Select label="Programme" error={errors.programId?.message} {...register('programId')}>
            <option value="">Select programme</option>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.qualificationCode ? ` (${p.qualificationCode})` : ''}</option>
            ))}
          </Select>
          <div className="grid gap-4 sm:grid-cols-3">
            {years.data?.length
              ? (
                <Select label="Admission session" error={errors.admissionSession?.message} {...register('admissionSession')}>
                  {years.data.filter((y) => SESSION.test(y.name)).map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
                </Select>
              )
              : <Input label="Admission session" placeholder="2026/2027" error={errors.admissionSession?.message} {...register('admissionSession')} />}
            <Input label="Level" type="number" step={100} error={errors.level?.message} {...register('level')} />
            <Input label="Admission no. (optional)" hint="From the admissions office" error={errors.admissionNumber?.message} {...register('admissionNumber')} />
          </div>
          <p className="text-xs text-slate-500">The Student ID, school email and a temporary PIN are generated automatically.</p>
        </>
      )}
    </FormModal>
  )
}

const LEVELS = [100, 200, 300, 400, 500, 600]

export default function Students() {
  const { user } = useAuth()
  const canAdmit = can(user, PERMS.STUDENT_ADMIT)
  const [admitting, setAdmitting] = useState(false)
  const [admitted, setAdmitted] = useState(null) // { student, credentials }
  const [params, setParams] = useSearchParams()
  const { semesterId, setSemesterId, semesters } = useSemesterParam()
  const f = {
    search: params.get('search') ?? '',
    departmentId: params.get('department') ?? '',
    programId: params.get('program') ?? '',
    level: params.get('level') ?? '',
    registrationStatus: params.get('registration') ?? '',
    status: params.get('status') ?? '',
  }
  const page = Number(params.get('page') ?? 1)
  const departments = useApi('/departments')
  const programs = useApi('/programs', f.departmentId ? { departmentId: f.departmentId } : undefined)
  const students = useApi('/students', {
    search: f.search || undefined,
    departmentId: f.departmentId || undefined,
    programId: f.programId || undefined,
    level: f.level || undefined,
    semesterId: semesterId || undefined,
    registrationStatus: f.registrationStatus || undefined,
    status: f.status || undefined,
    page,
    limit: 20,
    sort: 'name',
  })

  /** Update several URL filters at once; any change goes back to page 1. */
  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const drillDown = ({ departmentId, programId, level } = {}) => update({ department: departmentId, program: programId, level })
  const filtered = Boolean(f.search || f.departmentId || f.programId || f.level || f.registrationStatus || f.status)

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Browse students by department, programme and level, or search and filter the full list."
        action={canAdmit && <Button onClick={() => setAdmitting(true)}><UserPlus className="size-4" /> Admit student</Button>}
      />
      <AdmitStudent open={admitting} onClose={() => setAdmitting(false)} onAdmitted={setAdmitted} />
      <CredentialsDialog
        open={Boolean(admitted)}
        onClose={() => setAdmitted(null)}
        credentials={admitted?.credentials}
        name={admitted && `${fullName(admitted.student.user)} · ${admitted.student.program?.name ?? ''}`}
        action={admitted && <Link to={`/staff/students/${admitted.student.id}`}><Button variant="secondary">View student</Button></Link>}
      />

      <Card className="mb-4 space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput key={f.search} defaultValue={f.search} onSearch={(v) => update({ search: v })} placeholder="Name, Student ID or email" className="w-full sm:w-72" />
          <Select aria-label="Department" className="w-full sm:w-52" value={f.departmentId} onChange={(e) => update({ department: e.target.value, program: '', level: '' })}>
            <option value="">All departments</option>
            {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}{d.status === 'archived' ? ' (archived)' : ''}</option>)}
          </Select>
          <Select aria-label="Programme" className="w-full sm:w-56" value={f.programId} onChange={(e) => update({ program: e.target.value })}>
            <option value="">All programmes</option>
            {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </Select>
          <Select aria-label="Level" className="w-full sm:w-36" value={f.level} onChange={(e) => update({ level: e.target.value })}>
            <option value="">All levels</option>
            {LEVELS.map((l) => <option key={l} value={l}>Level {l}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />
          <Select aria-label="Registration status" className="w-full sm:w-52" value={f.registrationStatus} onChange={(e) => update({ registration: e.target.value })}>
            <option value="">Any registration status</option>
            <option value="none">Not registered</option>
            {Object.entries(REGISTRATION_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </Select>
          <Select aria-label="Academic status" className="w-full sm:w-44" value={f.status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Any academic status</option>
            {Object.keys(STUDENT_TONE).map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </Select>
          {filtered && (
            <Button variant="ghost" size="sm" onClick={() => update({ search: '', department: '', program: '', level: '', registration: '', status: '' })}>
              <X className="size-4" aria-hidden /> Clear filters
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500">Registration status is for the selected term.</p>
      </Card>

      <DepartmentOverview departmentId={f.departmentId} programId={f.programId} level={f.level} onSelect={drillDown} />

      <Card>
        <StudentTable
          query={students}
          onPage={(n) => update({ page: n })}
          empty={filtered ? 'No students match these filters' : 'No students yet'}
          emptyHint={filtered ? 'Try clearing a filter or choosing another term.' : undefined}
        />
      </Card>
    </div>
  )
}
