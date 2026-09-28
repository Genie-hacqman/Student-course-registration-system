import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, UserPlus } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Badge, Button, Card, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import CredentialsDialog from '../../components/admin/CredentialsDialog'
import { fullName } from '../../lib/format'
import { can, PERMS } from '../../lib/roles'
import { optionalNumber } from '../../lib/forms'

export const STUDENT_TONE = { active: 'green', probation: 'amber', suspended: 'red', graduated: 'slate' }

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
  const programs = useApi(open ? '/programs' : null)
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
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('search') ?? '')
  const page = Number(params.get('page') ?? 1)
  const students = useApi('/students', { search: params.get('search') || undefined, page, limit: 20, sort: 'studentNumber' })

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Students"
        subtitle="Find a student to review their record or grant a prerequisite waiver."
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
        <form className="relative max-w-lg" onSubmit={(e) => { e.preventDefault(); set('search', search.trim()) }}>
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={() => set('search', search.trim())}
            placeholder="Name, student number or email, then Enter"
            aria-label="Search students"
            className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </form>
      </Card>
      <Card>
        <QueryState query={students}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty="No students match"
              onRowClick={(s) => navigate(`/staff/students/${s.id}`)}
              columns={[
                { key: 'name', header: 'Name', render: (s) => <><span className="font-medium">{fullName(s.user)}</span><p className="text-xs text-slate-500">{s.user?.email}</p></> },
                { key: 'studentNumber', header: 'Student no.', render: (s) => <span className="tabular-nums">{s.studentNumber}</span> },
                { key: 'program', header: 'Program', render: (s) => s.program?.name },
                { key: 'level', header: 'Level' },
                { key: 'status', header: 'Status', render: (s) => <Badge tone={STUDENT_TONE[s.status]}>{s.status}</Badge> },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </div>
  )
}
