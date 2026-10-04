import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, Input, PageHeader, QueryState, SearchInput, Tabs } from '../../components/ui'
import DataTable, { stop } from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import OrgStatusBadge from '../../components/directory/OrgStatusBadge'
import { can, PERMS } from '../../lib/roles'

// Mirrors departmentSchema in server/src/validators/user.validator.js.
const schema = z.object({
  code: z.string().trim().min(2, 'At least 2 characters').max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'At least 2 characters').max(150),
})

export function DepartmentForm({ editing, onClose }) {
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/departments/${id}`, body) : http.post('/departments', body)), {
    success: (_d, v) => (v.id ? 'Department updated' : 'Department created'),
  })
  return (
    <FormModal
      open={Boolean(editing)}
      onClose={onClose}
      title={editing?.id ? `Edit ${editing.code}` : 'New department'}
      schema={schema}
      defaultValues={{ code: editing?.code ?? '', name: editing?.name ?? '' }}
      onSubmit={(values) => save.mutateAsync({ id: editing?.id, ...values })}
    >
      {({ register, formState: { errors } }) => (
        <>
          <Input label="Code" placeholder="e.g. CS" error={errors.code?.message} {...register('code')} />
          <Input label="Name" error={errors.name?.message} {...register('name')} />
        </>
      )}
    </FormModal>
  )
}

/** Archive (closed to new intake) or re-activate, with a plain explanation of what changes. */
export function DepartmentStatusDialog({ department, onClose }) {
  const archiving = department?.status !== 'archived'
  const change = useApiMutation(
    (d) => http.post(`/departments/${d.id}/${d.status === 'archived' ? 'activate' : 'archive'}`),
    { success: (_r, d) => (d.status === 'archived' ? `${d.code} is active again` : `${d.code} archived`) },
  )
  return (
    <ConfirmDialog
      open={Boolean(department)}
      onClose={onClose}
      danger={archiving}
      title={archiving ? `Archive ${department?.code}?` : `Activate ${department?.code}?`}
      confirmLabel={archiving ? 'Archive department' : 'Activate department'}
      onConfirm={() => change.mutateAsync(department)}
    >
      {archiving ? (
        <p>
          {department?.name} will be closed to new intake: no new programmes, courses, lecturers, applications or admissions.
          Its existing programmes, students, lecturers and history stay exactly as they are and remain visible. You can activate it again at any time.
        </p>
      ) : (
        <p>{department?.name} will accept new programmes, courses, lecturers and admissions again.</p>
      )}
    </ConfirmDialog>
  )
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

const count = (n) => <span className="tabular-nums">{n}</span>

export default function Departments() {
  const { user } = useAuth()
  const canManage = can(user, PERMS.COURSE_MANAGE)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const departments = useApi('/departments/summary', { search: search || undefined, status: status || undefined, page, limit: 20 })
  const remove = useApiMutation((id) => http.delete(`/departments/${id}`), { success: 'Department deleted' })
  const [editing, setEditing] = useState(null)
  const [changing, setChanging] = useState(null)
  const [deleting, setDeleting] = useState(null)

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
        title="Departments"
        subtitle="Each department's programmes, students, lecturers and courses. Open one to see them."
        action={canManage && <Button onClick={() => setEditing({})}><Plus className="size-4" /> New department</Button>}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <SearchInput key={search} defaultValue={search} onSearch={(v) => set('search', v)} placeholder="Department name or code" className="w-full sm:w-72" />
        <Tabs items={STATUS_TABS} value={status} onChange={(v) => set('status', v)} label="Department status" />
      </Card>
      <Card>
        <QueryState query={departments} loadingLabel="Loading departments…">
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty={search || status ? 'No departments match' : 'No departments yet'}
              emptyHint={!search && !status && canManage ? 'Create the first department to start adding programmes and courses.' : undefined}
              onRowClick={(d) => navigate(`/staff/departments/${d.id}`)}
              columns={[
                {
                  key: 'name', header: 'Department', render: (d) => (
                    <div className="leading-tight"><p className="font-medium">{d.name}</p><p className="text-xs text-slate-500">{d.code}</p></div>
                  ),
                },
                { key: 'programs', header: 'Programmes', render: (d) => <>{count(d.counts.programs)}{d.counts.activePrograms !== d.counts.programs && <span className="text-xs text-slate-500"> ({d.counts.activePrograms} active)</span>}</> },
                { key: 'students', header: 'Students', render: (d) => count(d.counts.students) },
                { key: 'lecturers', header: 'Lecturers', render: (d) => count(d.counts.lecturers) },
                { key: 'courses', header: 'Courses', render: (d) => count(d.counts.courses) },
                { key: 'status', header: 'Status', render: (d) => <OrgStatusBadge status={d.status} /> },
                ...(canManage ? [{
                  key: 'actions', header: '', className: 'w-32 text-right', render: (d) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${d.code}`} onClick={stop(() => setEditing(d))}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label={d.status === 'archived' ? `Activate ${d.code}` : `Archive ${d.code}`} onClick={stop(() => setChanging(d))}>
                        {d.status === 'archived' ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${d.code}`} className="text-red-600" onClick={stop(() => setDeleting(d))}><Trash2 className="size-4" /></Button>
                    </div>
                  ),
                }] : []),
              ]}
            />
          )}
        </QueryState>
      </Card>

      {canManage && (
        <>
          <DepartmentForm editing={editing} onClose={() => setEditing(null)} />
          <DepartmentStatusDialog department={changing} onClose={() => setChanging(null)} />
          <ConfirmDialog
            open={Boolean(deleting)}
            onClose={() => setDeleting(null)}
            title={`Delete ${deleting?.code}?`}
            confirmLabel="Delete"
            onConfirm={() => remove.mutateAsync(deleting.id)}
          >
            <p>{deleting?.name} will be removed permanently. A department that still has programmes, courses or lecturers can't be deleted. Archive it instead.</p>
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}
