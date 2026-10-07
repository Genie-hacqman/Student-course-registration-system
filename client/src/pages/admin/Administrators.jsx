import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck, UserPlus } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar, Badge, Button, Card, CardHeader, Input, PageHeader, QueryState, SearchInput, Select, Skeleton } from '../../components/ui'
import DataTable, { stop } from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { USER_TONE } from './Users'
import { formatDateTime, fullName } from '../../lib/format'
import { ROLES, ROLE_LABELS } from '../../lib/roles'

const inviteSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  email: z.email('Enter a valid email').max(191),
  role: z.enum([ROLES.ADMIN, ROLES.REGISTRAR]),
})

function Responsibilities() {
  const roles = useApi('/users/role-responsibilities')
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {roles.isPending && [0, 1].map((i) => <Skeleton key={i} className="h-48" />)}
      {roles.data?.map(({ role, permissions }) => {
        const groups = permissions.reduce((acc, p) => ({ ...acc, [p.group]: [...(acc[p.group] ?? []), p] }), {})
        return (
          <Card key={role}>
            <CardHeader title={`${ROLE_LABELS[role]} responsibilities`} subtitle={`${permissions.length} permissions`} icon={ShieldCheck} />
            <div className="space-y-3 px-5 py-4">
              {Object.entries(groups).map(([group, items]) => (
                <div key={group}>
                  <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</p>
                  <ul className="mt-1 space-y-1 text-sm text-slate-700">
                    {items.map((p) => <li key={p.name} className="flex gap-2"><span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-slate-400" />{p.description}</li>)}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

export default function Administrators() {
  const { user } = useAuth()
  const isAdmin = user?.role?.name === ROLES.ADMIN
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const role = params.get('role') ?? ''
  const page = Number(params.get('page') ?? 1)
  const staff = useApi('/users', {
    role: role || `${ROLES.ADMIN},${ROLES.REGISTRAR}`, search: search || undefined, status: status || undefined, page, limit: 20, sort: 'lastName',
  })
  const invite = useApiMutation((body) => http.post('/users', body), { success: (_d, v) => `Invitation sent to ${v.email}` })
  const setStatus = useApiMutation(({ id, status: next }) => http.patch(`/users/${id}`, { status: next }), {
    success: (_d, v) => (v.status === 'active' ? 'Account reactivated' : 'Account suspended'),
  })
  const [inviting, setInviting] = useState(false)
  const [changing, setChanging] = useState(null)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Administrators & Registrars"
        subtitle="The staff who run the institution and the registry, separate from students and lecturers."
        action={isAdmin && <Button onClick={() => setInviting(true)}><UserPlus className="size-4" /> Invite staff member</Button>}
      />
      {!isAdmin && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Only administrators can add, change or suspend these accounts.</p>
      )}

      <div>
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <SearchInput key={search} defaultValue={search} onSearch={(v) => set('search', v)} placeholder="Name or email" className="w-full sm:w-64" />
          <Select aria-label="Role" className="w-full sm:w-44" value={role} onChange={(e) => set('role', e.target.value)}>
            <option value="">Both roles</option>
            <option value={ROLES.ADMIN}>{ROLE_LABELS[ROLES.ADMIN]}</option>
            <option value={ROLES.REGISTRAR}>{ROLE_LABELS[ROLES.REGISTRAR]}</option>
          </Select>
          <Select aria-label="Account status" className="w-full sm:w-44" value={status} onChange={(e) => set('status', e.target.value)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Card>
        <Card>
          <QueryState query={staff} loadingLabel="Loading staff accounts…">
            {({ items, meta }) => (
              <DataTable
                rows={items}
                meta={meta}
                onPage={(n) => set('page', String(n))}
                empty="No staff accounts match"
                onRowClick={(u) => navigate(`/staff/users/${u.id}`)}
                columns={[
                  {
                    key: 'name', header: 'Name', render: (u) => (
                      <div className="flex items-center gap-3">
                        <Avatar user={u} thumb size="md" />
                        <div className="min-w-0"><p className="font-medium">{fullName(u)}{u.id === user?.id && <span className="text-slate-500"> (you)</span>}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div>
                      </div>
                    ),
                  },
                  { key: 'role', header: 'Role', render: (u) => <Badge tone={u.role?.name === ROLES.ADMIN ? 'blue' : 'slate'}>{ROLE_LABELS[u.role?.name]}</Badge> },
                  { key: 'status', header: 'Account', render: (u) => <Badge tone={USER_TONE[u.status]}>{u.status}</Badge> },
                  { key: 'lastLoginAt', header: 'Last sign-in', render: (u) => <span className="text-slate-600">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Never'}</span> },
                  ...(isAdmin ? [{
                    key: 'actions', header: '', className: 'text-right', render: (u) => u.id !== user?.id && (
                      <Button size="sm" variant="ghost" className={u.status === 'suspended' ? '' : 'text-red-600'} onClick={stop(() => setChanging(u))}>
                        {u.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </Button>
                    ),
                  }] : []),
                ]}
              />
            )}
          </QueryState>
        </Card>
      </div>

      <Responsibilities />

      {isAdmin && (
        <>
          <FormModal
            open={inviting}
            onClose={() => setInviting(false)}
            title="Invite a staff member"
            schema={inviteSchema}
            defaultValues={{ firstName: '', lastName: '', email: '', role: ROLES.REGISTRAR }}
            submitLabel="Send invitation"
            onSubmit={(v) => invite.mutateAsync(v)}
          >
            {({ register, formState: { errors } }) => (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
                  <Input label="Last name" error={errors.lastName?.message} {...register('lastName')} />
                </div>
                <Input label="Work email" type="email" error={errors.email?.message} {...register('email')} />
                <Select label="Role" error={errors.role?.message} {...register('role')}>
                  <option value={ROLES.REGISTRAR}>{ROLE_LABELS[ROLES.REGISTRAR]}</option>
                  <option value={ROLES.ADMIN}>{ROLE_LABELS[ROLES.ADMIN]}</option>
                </Select>
                <p className="text-xs text-slate-500">They'll get an email link to set their own password. You never see or choose it.</p>
              </>
            )}
          </FormModal>
          <ConfirmDialog
            open={Boolean(changing)}
            onClose={() => setChanging(null)}
            danger={changing?.status !== 'suspended'}
            title={changing?.status === 'suspended' ? `Reactivate ${fullName(changing)}?` : `Suspend ${fullName(changing)}?`}
            confirmLabel={changing?.status === 'suspended' ? 'Reactivate' : 'Suspend account'}
            onConfirm={() => setStatus.mutateAsync({ id: changing.id, status: changing.status === 'suspended' ? 'active' : 'suspended' })}
          >
            {changing?.status === 'suspended'
              ? <p>{fullName(changing)} will be able to sign in again with their existing role.</p>
              : <p>{fullName(changing)} will be signed out everywhere and unable to sign in until reactivated. Their history is kept. The last active administrator can't be suspended.</p>}
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}
