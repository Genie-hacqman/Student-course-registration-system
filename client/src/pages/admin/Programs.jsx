import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Button, Card, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable, { stop } from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { requiredNumber } from '../../lib/forms'

// Mirrors createProgramSchema in SCRS-backend src/validators/user.validator.js.
export const programSchema = z.object({
  code: z.string().trim().min(2, 'At least 2 characters').max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'At least 2 characters').max(150),
  departmentId: requiredNumber(z.number().int().positive('Choose a department'), 'Choose a department'),
  durationYears: requiredNumber(z.number().int().min(1).max(10)),
  maxCredits: requiredNumber(z.number().int().min(1).max(60)),
})

export function ProgramForm({ editing, onClose, onSaved }) {
  const departments = useApi('/departments')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/programs/${id}`, body) : http.post('/programs', body)), {
    success: (_d, v) => (v.id ? 'Program updated' : 'Program created'),
  })
  return (
    <FormModal
      open={Boolean(editing)}
      onClose={onClose}
      title={editing?.id ? `Edit ${editing.code}` : 'New program'}
      schema={programSchema}
      defaultValues={{
        code: editing?.code ?? '',
        name: editing?.name ?? '',
        departmentId: editing?.departmentId ?? '',
        durationYears: editing?.durationYears ?? 4,
        maxCredits: editing?.maxCredits ?? 24,
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
            {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Duration (years)" type="number" error={errors.durationYears?.message} {...register('durationYears')} />
            <Input label="Max credits per semester" type="number" hint="Used when the semester sets no limit" error={errors.maxCredits?.message} {...register('maxCredits')} />
          </div>
        </>
      )}
    </FormModal>
  )
}

export default function Programs() {
  const navigate = useNavigate()
  const programs = useApi('/programs')
  const remove = useApiMutation((id) => http.delete(`/programs/${id}`), { success: 'Program deleted' })
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  return (
    <div>
      <PageHeader
        title="Programs"
        subtitle="A program's curriculum decides which courses its students can register for."
        action={<Button onClick={() => setEditing({})}><Plus className="size-4" /> New program</Button>}
      />
      <Card>
        <QueryState query={programs}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="No programs yet"
              onRowClick={(p) => navigate(`/staff/programs/${p.id}`)}
              columns={[
                { key: 'code', header: 'Code', render: (p) => <span className="font-medium">{p.code}</span> },
                { key: 'name', header: 'Name' },
                { key: 'department', header: 'Department', render: (p) => p.department?.name },
                { key: 'durationYears', header: 'Years' },
                { key: 'maxCredits', header: 'Max credits' },
                {
                  key: 'actions', header: '', className: 'w-24 text-right', render: (p) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${p.code}`} onClick={stop(() => setEditing(p))}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${p.code}`} className="text-red-600" onClick={stop(() => setDeleting(p))}><Trash2 className="size-4" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <ProgramForm editing={editing} onClose={() => setEditing(null)} onSaved={(p) => !editing?.id && p && navigate(`/staff/programs/${p.id}`)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.code}?`}
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync(deleting.id)}
      >
        <p>{deleting?.name} and its curriculum will be removed. A program with enrolled students can't be deleted.</p>
      </ConfirmDialog>
    </div>
  )
}
