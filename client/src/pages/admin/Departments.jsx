import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Button, Card, Input, PageHeader, QueryState } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'

// Mirrors createDepartmentSchema in SCRS-backend src/validators/user.validator.js.
const schema = z.object({
  code: z.string().trim().min(2, 'At least 2 characters').max(20).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2, 'At least 2 characters').max(150),
})

export default function Departments() {
  const departments = useApi('/departments')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/departments/${id}`, body) : http.post('/departments', body)), {
    success: (_d, v) => (v.id ? 'Department updated' : 'Department created'),
  })
  const remove = useApiMutation((id) => http.delete(`/departments/${id}`), { success: 'Department deleted' })
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  return (
    <div>
      <PageHeader
        title="Departments"
        subtitle="Departments own programs, courses and lecturers."
        action={<Button onClick={() => setEditing({})}><Plus className="size-4" /> New department</Button>}
      />
      <Card>
        <QueryState query={departments}>
          {(rows) => (
            <DataTable
              rows={rows}
              empty="No departments yet"
              columns={[
                { key: 'code', header: 'Code', render: (d) => <span className="font-medium">{d.code}</span> },
                { key: 'name', header: 'Name' },
                {
                  key: 'actions', header: '', className: 'w-24 text-right', render: (d) => (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" aria-label={`Edit ${d.code}`} onClick={() => setEditing(d)}><Pencil className="size-4" /></Button>
                      <Button size="sm" variant="ghost" aria-label={`Delete ${d.code}`} className="text-red-600" onClick={() => setDeleting(d)}><Trash2 className="size-4" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.code}` : 'New department'}
        schema={schema}
        defaultValues={{ code: editing?.code ?? '', name: editing?.name ?? '' }}
        onSubmit={(values) => save.mutateAsync({ id: editing?.id, ...values })}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Input label="Code" placeholder="e.g. CS" error={errors.code?.message} {...register('code')} />
            <Input label="Name" placeholder="e.g. Computer Science" error={errors.name?.message} {...register('name')} />
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.code}?`}
        confirmLabel="Delete"
        onConfirm={() => remove.mutateAsync(deleting.id)}
      >
        <p>{deleting?.name} will be removed. A department that still has programs, courses or lecturers can't be deleted.</p>
      </ConfirmDialog>
    </div>
  )
}
