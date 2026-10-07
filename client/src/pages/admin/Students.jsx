import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, Input, PageHeader, SearchInput, Select } from '../../components/ui'
import FormModal from '../../components/admin/FormModal'
import CredentialsDialog from '../../components/admin/CredentialsDialog'
import StudentTable, { STUDENT_TONE } from '../../components/directory/StudentTable'
import DepartmentOverview from '../../components/directory/DepartmentOverview'
import { fullName } from '../../lib/format'
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

export default function Students() {
  const { user } = useAuth()
  const canAdmit = can(user, PERMS.STUDENT_ADMIT)
  const [admitting, setAdmitting] = useState(false)
  const [admitted, setAdmitted] = useState(null) // { student, credentials }
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const page = Number(params.get('page') ?? 1)
  // Students only load once something is searched for; otherwise people browse by department and programme.
  const results = useApi(search ? '/students' : null, { search, page, limit: 20, sort: 'name' })

  const update = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Browse students by department and programme, or search for a student by name, Student ID or email."
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

      <Card className="mb-4 p-4">
        <SearchInput key={search} defaultValue={search} onSearch={(v) => update({ search: v })} placeholder="Name, Student ID or email" className="w-full sm:w-96" />
      </Card>

      {search ? (
        <Card className="mb-4">
          <StudentTable
            query={results}
            onPage={(n) => update({ page: n })}
            empty="No students match this search"
            emptyHint="Check the spelling, or browse by department below."
          />
        </Card>
      ) : null}

      <DepartmentOverview />
    </div>
  )
}
