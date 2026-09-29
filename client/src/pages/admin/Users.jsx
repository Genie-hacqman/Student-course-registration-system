import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, Input, PageHeader, QueryState, SearchInput, Select } from '../../components/ui'
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
  // Empty: the backend emails an invite and they choose their own password.
  password: z.union([z.literal(''), passwordSchema]),
  role: z.enum(ROLE_ORDER),
  // Student profile
  programId: optionalNumber(z.number().int().positive()),
  level: optionalNumber(z.number().int().min(100).max(900)),
  studentNumber: z.string().trim().max(30).optional(),
  // Lecturer profile
  departmentId: optionalNumber(z.number().int().positive()),
  staffNumber: z.string().trim().max(30).optional(),
  title: z.string().trim().max(50).optional(),
})
  .refine((d) => d.role !== 'STUDENT' || d.programId, { message: 'Choose a program', path: ['programId'] })
  .refine((d) => d.role !== 'LECTURER' || d.departmentId, { message: 'Choose a department', path: ['departmentId'] })
  .refine((d) => d.role !== 'LECTURER' || (d.staffNumber?.length ?? 0) >= 2, { message: 'At least 2 characters', path: ['staffNumber'] })
  .refine((d) => !d.studentNumber || d.studentNumber.length >= 3, { message: 'At least 3 characters', path: ['studentNumber'] })

/** Creates the account, then the student or lecturer profile that the role needs. */
function CreateUser({ open, onClose }) {
  const navigate = useNavigate()
  const programs = useApi(open ? '/programs' : null)
  const departments = useApi(open ? '/departments' : null)
  const create = useApiMutation(async (v) => {
    const user = await http.post('/users', {
      firstName: v.firstName, lastName: v.lastName, email: v.email, role: v.role, ...(v.password ? { password: v.password } : {}),
    })
    try {
      if (v.role === 'STUDENT') {
        await http.post('/students', { userId: user.id, programId: v.programId, level: v.level ?? 100, ...(v.studentNumber ? { studentNumber: v.studentNumber } : {}) })
      }
      if (v.role === 'LECTURER') {
        await http.post('/lecturers', { userId: user.id, departmentId: v.departmentId, staffNumber: v.staffNumber, ...(v.title ? { title: v.title } : {}) })
      }
    } catch (err) {
      // The account exists; its profile can be added from the user's page.
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
      defaultValues={{ firstName: '', lastName: '', email: '', password: '', role: 'STUDENT', programId: '', level: 100, studentNumber: '', departmentId: '', staffNumber: '', title: '' }}
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
                <Input label="Staff number" error={errors.staffNumber?.message} {...register('staffNumber')} />
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
  const users = useApi('/users', {
    search: params.get('search') || undefined,
    role: params.get('role') || undefined,
    status: params.get('status') || undefined,
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
  const hasFilters = params.get('search') || params.get('role') || params.get('status')

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Accounts for students, lecturers and staff. Accounts are suspended, never deleted, so records stay intact."
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
                { key: 'name', header: 'Name', render: (u) => <span className="font-medium">{fullName(u)}</span> },
                { key: 'email', header: 'Email', render: (u) => <span className="text-slate-600">{u.email}</span> },
                { key: 'role', header: 'Role', render: (u) => ROLE_LABELS[u.role?.name] },
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
