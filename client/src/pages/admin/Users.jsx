import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Avatar, Badge, Button, Card, Input, PageHeader, QueryState, SearchInput, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import { formatDateTime, fullName } from '../../lib/format'
import { emailSchema, optionalNumber, passwordSchema } from '../../lib/forms'
import { ROLE_LABELS } from '../../lib/roles'

export const USER_TONE = { active: 'green', suspended: 'red', pending: 'amber' }
const ROLE_ORDER = ['STUDENT', 'LECTURER', 'REGISTRAR', 'ADMIN']

const createSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  email: emailSchema,
  password: z.union([z.literal(''), passwordSchema]),
  role: z.enum(ROLE_ORDER),
  programId: optionalNumber(z.number().int().positive()),
  level: optionalNumber(z.number().int().min(100).max(900)),
  studentNumber: z.string().trim().max(30).optional(),
  departmentId: optionalNumber(z.number().int().positive()),
  title: z.string().trim().max(50).optional(),
})
  .refine((d) => d.role !== 'STUDENT' || d.programId, { message: 'Choose a program', path: ['programId'] })
  .refine((d) => d.role !== 'LECTURER' || d.departmentId, { message: 'Choose a department', path: ['departmentId'] })
  .refine((d) => !d.studentNumber || d.studentNumber.length >= 3, { message: 'At least 3 characters', path: ['studentNumber'] })

function CreateUser({ open, onClose }) {
  const navigate = useNavigate()
  const programs = useApi(open ? '/programs' : null, { status: 'active' })
  const departments = useApi(open ? '/departments' : null, { status: 'active' })
  const create = useApiMutation(async (v) => {
    const user = await http.post('/users', {
      firstName: v.firstName, lastName: v.lastName, email: v.email, role: v.role, ...(v.password ? { password: v.password } : {}),
    })
    try {
      if (v.role === 'STUDENT') {
        await http.post('/students', { userId: user.id, programId: v.programId, level: v.level ?? 100, ...(v.studentNumber ? { studentNumber: v.studentNumber } : {}) })
      }
      if (v.role === 'LECTURER') {
        await http.post('/lecturers', { userId: user.id, departmentId: v.departmentId, ...(v.title ? { title: v.title } : {}) })
      }
    } catch (err) {
      toast.error(`Account created, but the ${v.role === 'STUDENT' ? 'student' : 'lecturer'} profile failed: ${err.message}`)
    }
    return user
  }, { success: 'Account created' })

  return (
    <FormModal
      open={open}
      onClose={onClose}
      wide
      title="New user"
      schema={createSchema}
      defaultValues={{ firstName: '', lastName: '', email: '', password: '', role: 'STUDENT', programId: '', level: 100, studentNumber: '', departmentId: '', title: '' }}
      onSubmit={async (v) => {
        const user = await create.mutateAsync(v)
        navigate(`/staff/users/${user.id}`)
      }}
      submitLabel="Create user"
    >
      {({ register, watch, formState: { errors } }) => {
        const role = watch('role')
        return (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
              <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Email" type="email" error={errors.email?.message} {...register('email')} />
              <Input label="Temporary password (optional)" type="text" autoComplete="off" hint="Leave empty to email them an invite to choose their own" error={errors.password?.message} {...register('password')} />
            </div>
            <Select label="Role" {...register('role')}>
              {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
            {role === 'STUDENT' && (
              <fieldset className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
                <legend className="px-1 text-sm font-medium text-slate-700">Student record</legend>
                <Select label="Program" error={errors.programId?.message} {...register('programId')}>
                  <option value="">Select program</option>
                  {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
                <Input label="Level" type="number" step={100} error={errors.level?.message} {...register('level')} />
                <Input label="Student number (optional)" hint="Generated if left empty" error={errors.studentNumber?.message} {...register('studentNumber')} />
              </fieldset>
            )}
            {role === 'LECTURER' && (
              <fieldset className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-3">
                <legend className="px-1 text-sm font-medium text-slate-700">Lecturer record</legend>
                <Select label="Department" error={errors.departmentId?.message} {...register('departmentId')}>
                  <option value="">Select department</option>
                  {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
                <Input label="Staff number" value="Generated automatically" disabled readOnly />
                <Input label="Title (optional)" placeholder="e.g. Dr." error={errors.title?.message} {...register('title')} />
              </fieldset>
            )}
          </>
        )
      }}
    </FormModal>
  )
}

export default function Users() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const departmentId = params.get('department') ?? ''
  const departments = useApi('/departments')
  const programs = useApi('/programs', departmentId ? { departmentId } : undefined)
  const users = useApi('/users', {
    search: params.get('search') || undefined,
    role: params.get('role') || undefined,
    status: params.get('status') || undefined,
    departmentId: departmentId || undefined,
    programId: params.get('program') || undefined,
    page: Number(params.get('page') ?? 1),
    limit: 20,
    sort: 'lastName',
  })

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const hasFilters = params.get('search') || params.get('role') || params.get('status') || departmentId || params.get('program')

  return (
    <div>
      <PageHeader
        title="All Users"
        subtitle="Every account in one place. Students, Lecturers and Administrators & Registrars each have their own page too. Accounts are suspended, never deleted."
        action={<Button onClick={() => setCreating(true)}><Plus className="size-4" /> New user</Button>}
      />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <SearchInput
          key={params.get('search') ?? ''}
          className="w-full sm:w-64"
          defaultValue={params.get('search') ?? ''}
          onSearch={(v) => set('search', v)}
          placeholder="Name or email, then Enter"
          aria-label="Search users"
        />
        <Select value={params.get('role') ?? ''} onChange={(e) => set('role', e.target.value)} aria-label="Role" className="w-full sm:w-auto">
          <option value="">All roles</option>
          {ROLE_ORDER.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </Select>
        <Select value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} aria-label="Status" className="w-full sm:w-auto">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="pending">Pending</option>
        </Select>
        <Select value={departmentId} onChange={(e) => { const next = new URLSearchParams(params); if (e.target.value) next.set('department', e.target.value); else next.delete('department'); next.delete('program'); next.delete('page'); setParams(next, { replace: true }) }} aria-label="Department" className="w-full sm:w-52">
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select value={params.get('program') ?? ''} onChange={(e) => set('program', e.target.value)} aria-label="Programme" className="w-full sm:w-52">
          <option value="">All programmes</option>
          {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
        </Select>
        {hasFilters && <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
      </Card>
      <Card>
        <QueryState query={users}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty="No users match"
              onRowClick={(u) => navigate(`/staff/users/${u.id}`)}
              columns={[
                { key: 'name', header: 'Name', render: (u) => <span className="flex items-center gap-3"><Avatar user={u} thumb size="md" /><span className="font-medium">{fullName(u)}</span></span> },
                { key: 'email', header: 'Email', render: (u) => <span className="text-slate-600">{u.email}</span> },
                { key: 'role', header: 'Role', render: (u) => ROLE_LABELS[u.role?.name] },
                {
                  key: 'department', header: 'Department / programme', render: (u) => {
                    if (u.student) return <span className="leading-tight"><span className="block">{u.student.program?.department?.code ?? '—'}</span><span className="block text-xs text-slate-500">{u.student.program?.code}</span></span>
                    if (u.lecturer) return u.lecturer.department?.code ?? '—'
                    return <span className="text-slate-400">—</span>
                  },
                },
                { key: 'lastLoginAt', header: 'Last sign-in', render: (u) => <span className="text-slate-600">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</span> },
                { key: 'status', header: 'Status', render: (u) => <Badge tone={USER_TONE[u.status]}>{u.status}</Badge> },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <CreateUser open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
