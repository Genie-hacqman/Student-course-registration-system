import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, CardHeader, Input, PageHeader, QueryState, SearchInput, Select, Tabs } from '../../components/ui'
import DataTable, { stop } from '../../components/admin/DataTable'
import FormModal, { Checkbox } from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import OrgStatusBadge from '../../components/directory/OrgStatusBadge'
import { requiredNumber } from '../../lib/forms'
import { can, PERMS } from '../../lib/roles'

export const programSchema = z.object({
  code: z.string().trim().min(2, 'At least 2 characters').max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'At least 2 characters').max(150),
  departmentId: requiredNumber(z.number().int().positive('Choose a department'), 'Choose a department'),
  durationYears: requiredNumber(z.number().int().min(1).max(10)),
  maxCredits: requiredNumber(z.number().int().min(1).max(60)),
  autoApprove: z.boolean(),
})

export function ProgramForm({ editing, onClose, onSaved }) {
  const departments = useApi('/departments')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/programs/${id}`, body) : http.post('/programs', body)), {
    success: (_d, v) => (v.id ? 'Programme updated' : 'Programme created'),
  })
  return (
    <FormModal
      open={Boolean(editing)}
      onClose={onClose}
      title={editing?.id ? `Edit ${editing.code}` : 'New programme'}
      schema={programSchema}
      defaultValues={{
        code: editing?.code ?? '',
        name: editing?.name ?? '',
        departmentId: editing?.departmentId ?? '',
        durationYears: editing?.durationYears ?? 4,
        maxCredits: editing?.maxCredits ?? 24,
        autoApprove: editing?.autoApprove ?? false,
      }}
      onSubmit={async (values) => {
        const saved = await save.mutateAsync({ id: editing?.id, ...values })
        onSaved?.(saved)
      }}
    >
      {({ register, formState: { errors } }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Code" placeholder="e.g. BSC-CS" error={errors.code?.message} {...register('code')} />
            <Input label="Name" className="sm:col-span-2" placeholder="e.g. BSc Computer Science" error={errors.name?.message} {...register('name')} />
          </div>
          <Select label="Department" error={errors.departmentId?.message} {...register('departmentId')}>
            <option value="">Select department</option>
            {departments.data?.filter((d) => d.status !== 'archived' || d.id === editing?.departmentId).map((d) => (
              <option key={d.id} value={d.id}>{d.name}{d.status === 'archived' ? ' (archived)' : ''}</option>
            ))}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Duration (years)" type="number" error={errors.durationYears?.message} {...register('durationYears')} />
            <Input label="Max credits per semester" type="number" hint="Used when the semester sets no limit" error={errors.maxCredits?.message} {...register('maxCredits')} />
          </div>
          <Checkbox
            label="Approve registrations automatically"
            hint="Students on this programme are confirmed as soon as their registration passes every check and their timetable is clear. Anything else still goes to the registrar."
            {...register('autoApprove')}
          />
        </>
      )}
    </FormModal>
  )
}

export function ProgramStatusDialog({ program, onClose }) {
  const archiving = program?.status !== 'archived'
  const change = useApiMutation(
    (p) => http.post(`/programs/${p.id}/${p.status === 'archived' ? 'activate' : 'archive'}`),
    { success: (_r, p) => (p.status === 'archived' ? `${p.code} is active again` : `${p.code} archived`) },
  )
  return (
    <ConfirmDialog
      open={Boolean(program)}
      onClose={onClose}
      danger={archiving}
      title={archiving ? `Archive ${program?.code}?` : `Activate ${program?.code}?`}
      confirmLabel={archiving ? 'Archive programme' : 'Activate programme'}
      onConfirm={() => change.mutateAsync(program)}
    >
      {archiving
        ? <p>{program?.name} will stop accepting applications and admissions and disappear from the applicant form. Its current students, curriculum and history stay as they are.</p>
        : <p>{program?.name} will accept applications and admissions again. Its department must be active.</p>}
    </ConfirmDialog>
  )
}

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
]

export default function Programs() {
  const { user } = useAuth()
  const canManage = can(user, PERMS.COURSE_MANAGE)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const search = params.get('search') ?? ''
  const status = params.get('status') ?? ''
  const departmentId = params.get('department') ?? ''
  const departments = useApi('/departments')
  const programs = useApi('/programs', { search: search || undefined, status: status || undefined, departmentId: departmentId || undefined })
  const summary = useApi('/students/summary')
  const remove = useApiMutation((id) => http.delete(`/programs/${id}`), { success: 'Programme deleted' })
  const [editing, setEditing] = useState(null)
  const [changing, setChanging] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const studentsByProgram = new Map(summary.data?.departments.flatMap((d) => d.programs.map((p) => [p.id, p.students])) ?? [])

  return (
    <div>
      <PageHeader
        title="Programmes"
        subtitle="Each department's programmes. Open one to see its students by level and its curriculum."
        action={canManage && <Button onClick={() => setEditing({})}><Plus className="size-4" /> New programme</Button>}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <SearchInput key={search} defaultValue={search} onSearch={(v) => set('search', v)} placeholder="Programme name or code" className="w-full sm:w-64" />
        <Select aria-label="Department" className="w-full sm:w-56" value={departmentId} onChange={(e) => set('department', e.target.value)}>
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Tabs items={STATUS_TABS} value={status} onChange={(v) => set('status', v)} label="Programme status" />
      </Card>

      <QueryState query={programs} loadingLabel="Loading programmes…">
        {(rows) => {
          if (!rows.length) {
            return <Card><DataTable rows={[]} columns={[]} empty={search || status || departmentId ? 'No programmes match' : 'No programmes yet'} /></Card>
          }
          const groups = new Map()
          for (const p of rows) {
            const key = p.department?.id ?? 0
            if (!groups.has(key)) groups.set(key, { department: p.department, programs: [] })
            groups.get(key).programs.push(p)
          }
          return (
            <div className="space-y-4">
              {[...groups.values()].map(({ department, programs: list }) => (
                <Card key={department?.id ?? 'none'}>
                  <CardHeader
                    title={department ? <Link to={`/staff/departments/${department.id}`} className="hover:text-brand-700">{department.name}</Link> : 'No department'}
                    subtitle={`${department?.code ?? ''} · ${list.length} ${list.length === 1 ? 'programme' : 'programmes'}`}
                    action={department?.status === 'archived' && <OrgStatusBadge status="archived" />}
                  />
                  <DataTable
                    rows={list}
                    onRowClick={(p) => navigate(`/staff/programs/${p.id}`)}
                    columns={[
                      { key: 'name', header: 'Programme', render: (p) => <div className="leading-tight"><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.code}</p></div> },
                      { key: 'qualification', header: 'Qualification', render: (p) => p.qualificationCode || '—' },
                      { key: 'duration', header: 'Duration', render: (p) => `${p.durationYears} ${p.durationYears === 1 ? 'year' : 'years'}` },
                      { key: 'students', header: 'Students', render: (p) => <span className="tabular-nums">{studentsByProgram.get(p.id) ?? (summary.isPending ? '…' : 0)}</span> },
                      { key: 'status', header: 'Status', render: (p) => <OrgStatusBadge status={p.status} /> },
                      ...(canManage ? [{
                        key: 'actions', header: '', className: 'w-32 text-right', render: (p) => (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" aria-label={`Edit ${p.code}`} onClick={stop(() => setEditing(p))}><Pencil className="size-4" /></Button>
                            <Button size="sm" variant="ghost" aria-label={p.status === 'archived' ? `Activate ${p.code}` : `Archive ${p.code}`} onClick={stop(() => setChanging(p))}>
                              {p.status === 'archived' ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                            </Button>
                            <Button size="sm" variant="ghost" aria-label={`Delete ${p.code}`} className="text-red-600" onClick={stop(() => setDeleting(p))}><Trash2 className="size-4" /></Button>
                          </div>
                        ),
                      }] : []),
                    ]}
                  />
                </Card>
              ))}
            </div>
          )
        }}
      </QueryState>

      {canManage && (
        <>
          <ProgramForm editing={editing} onClose={() => setEditing(null)} onSaved={(p) => !editing?.id && p && navigate(`/staff/programs/${p.id}`)} />
          <ProgramStatusDialog program={changing} onClose={() => setChanging(null)} />
          <ConfirmDialog
            open={Boolean(deleting)}
            onClose={() => setDeleting(null)}
            title={`Delete ${deleting?.code}?`}
            confirmLabel="Delete"
            onConfirm={() => remove.mutateAsync(deleting.id)}
          >
            <p>{deleting?.name} and its curriculum will be removed permanently. A programme with students can't be deleted. Archive it instead.</p>
          </ConfirmDialog>
        </>
      )}
    </div>
  )
}
