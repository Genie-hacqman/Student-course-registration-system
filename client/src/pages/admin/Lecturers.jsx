import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar, Badge, Button, Card, Input, PageHeader, QueryState, SearchInput, Select, Tabs, cx } from '../../components/ui'
import { can, PERMS } from '../../lib/roles'
import DataTable, { stop } from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import { fullName } from '../../lib/format'
import { requiredNumber } from '../../lib/forms'

const optionalText = (max) => z.string().trim().max(max).optional().transform((v) => v || undefined)
const optionalEmail = z.union([z.literal(''), z.email('Enter a valid email').max(191)]).optional().transform((v) => v || undefined)

export const lecturerSchema = z.object({
  title: optionalText(50),
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  staffNumber: z.union([z.literal(''), z.string().trim().min(2, 'At least 2 characters').max(30)]).optional().transform((v) => v || undefined),
  departmentId: requiredNumber(z.number().int().positive('Choose a department'), 'Choose a department'),
  schoolEmail: optionalEmail,
  personalEmail: optionalEmail,
  phone: z.union([z.literal(''), z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')]).optional().transform((v) => v || undefined),
  specialization: optionalText(150),
})

export const lecturerStatus = (l) => {
  if (l.user?.status !== 'active') return { label: 'Inactive', tone: 'slate' }
  if (Number(l.invitePending)) return { label: 'Invited — not activated', tone: 'amber' }
  return { label: 'Active', tone: 'green' }
}

export function LecturerFields({ register, errors, departments, creating }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-5">
        <Input label="Title" placeholder="Dr." error={errors.title?.message} {...register('title')} />
        <Input label="First name" className="sm:col-span-2" error={errors.firstName?.message} {...register('firstName')} />
        <Input label="Last name" className="sm:col-span-2" error={errors.lastName?.message} {...register('lastName')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {creating
          ? <Input label="Staff ID" value="Generated automatically" disabled readOnly hint="A unique ID is assigned when the lecturer is saved." />
          : <Input label="Staff ID" error={errors.staffNumber?.message} {...register('staffNumber')} />}
        <Select label="Department" error={errors.departmentId?.message} {...register('departmentId')}>
          <option value="">Select department</option>
          {departments?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {creating && (
          <Input
            label="School email"
            type="email"
            hint="Leave blank to generate first.last@ the staff email domain (System settings)."
            error={errors.schoolEmail?.message}
            {...register('schoolEmail')}
          />
        )}
        <Input label="Personal email" type="email" hint={creating ? 'The activation link is sent here when given.' : undefined} error={errors.personalEmail?.message} {...register('personalEmail')} />
        <Input label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
        <Input label="Specialization" placeholder="e.g. Distributed systems" error={errors.specialization?.message} {...register('specialization')} />
      </div>
    </>
  )
}

const chip = (active) => cx(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 transition',
  active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-brand-300',
)

export default function Lecturers() {
  const { user } = useAuth()
  const canManage = can(user, PERMS.USER_MANAGE)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const departments = useApi('/departments')
  const summary = useApi('/departments/summary', { limit: 100 })
  const departmentId = params.get('department') ?? ''
  const status = params.get('status') ?? ''
  const lecturers = useApi('/lecturers', {
    search: params.get('search') || undefined,
    departmentId: params.get('department') || undefined,
    status: status || undefined,
    page: Number(params.get('page') ?? 1),
    limit: 20,
  })
  const [creating, setCreating] = useState(false)
  const create = useApiMutation((body) => http.post('/lecturers', body), {
    success: (l) => `${fullName(l.user)} added. An activation link was emailed to ${l.personalEmail ?? l.user.email}.`,
  })
  const toggle = useApiMutation(({ id, active }) => http.post(`/lecturers/${id}/${active ? 'activate' : 'deactivate'}`), {
    success: (l, v) => `${fullName(l.user)} ${v.active ? 'activated' : 'deactivated'}`,
  })
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
        title="Lecturers"
        subtitle="Lecturer accounts and profiles. New lecturers get an emailed link to set their own password. The registry assigns them to courses."
        action={canManage && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> Add lecturer</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Lecturers by department">
        <button type="button" className={chip(!departmentId)} onClick={() => set('department', '')}>All departments</button>
        {summary.data?.items.map((d) => (
          <button key={d.id} type="button" className={chip(String(d.id) === departmentId)} onClick={() => set('department', String(d.id))} title={d.name}>
            {d.code} <span className="tabular-nums opacity-80">{d.counts.lecturers}</span>
          </button>
        ))}
      </div>
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <SearchInput key={params.get('search') ?? ''} defaultValue={params.get('search') ?? ''} onSearch={(v) => set('search', v)} placeholder="Name, email or staff ID" className="w-full sm:w-72" />
        <Select value={departmentId} onChange={(e) => set('department', e.target.value)} aria-label="Department" className="w-full sm:w-56">
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Tabs items={[{ value: '', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Inactive' }]} value={status} onChange={(v) => set('status', v)} />
      </Card>
      <Card>
        <QueryState query={lecturers}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              onRowClick={(l) => navigate(`/staff/lecturers/${l.id}`)}
              empty="No lecturers match"
              columns={[
                {
                  key: 'name', header: 'Lecturer', render: (l) => (
                    <div className="flex items-center gap-3">
                      <Avatar user={l.user} thumb size="md" />
                      <div className="leading-tight">
                        <p className="font-medium">{[l.title, fullName(l.user)].filter(Boolean).join(' ')}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{l.user?.email}</p>
                      </div>
                    </div>
                  ),
                },
                { key: 'staffNumber', header: 'Staff ID' },
                {
                  key: 'department', header: 'Departments', render: (l) => (
                    <div className="flex flex-wrap gap-1">
                      <span title={`Home department: ${l.department?.name ?? ''}`} className="font-medium">{l.department?.code}</span>
                      {l.additionalDepartments?.map((d) => <Badge key={d.id} tone="slate">{d.code}</Badge>)}
                    </div>
                  ),
                },
                { key: 'specialization', header: 'Specialization', render: (l) => l.specialization || '—' },
                { key: 'courses', header: 'Current offerings', render: (l) => Number(l.currentSections ?? 0) },
                { key: 'status', header: 'Status', render: (l) => { const st = lecturerStatus(l); return <Badge tone={st.tone}>{st.label}</Badge> } },
                {
                  key: 'actions', header: '', className: 'text-right', render: (l) => canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={toggle.isPending && toggle.variables?.id === l.id}
                      onClick={stop(() => toggle.mutate({ id: l.id, active: l.user?.status !== 'active' }))}
                    >
                      {l.user?.status === 'active' ? 'Deactivate' : 'Activate'}
                    </Button>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <FormModal
        open={creating}
        onClose={() => setCreating(false)}
        wide
        title="Add lecturer"
        schema={lecturerSchema}
        defaultValues={{ title: '', firstName: '', lastName: '', staffNumber: '', departmentId: '', schoolEmail: '', personalEmail: '', phone: '', specialization: '' }}
        onSubmit={async (v) => {
          const lecturer = await create.mutateAsync(v)
          navigate(`/staff/lecturers/${lecturer.id}`)
        }}
        submitLabel="Create and send activation link"
      >
        {({ register, formState: { errors } }) => <LecturerFields register={register} errors={errors} departments={departments.data?.filter((d) => d.status !== 'archived')} creating />}
      </FormModal>
    </div>
  )
}
