import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, ErrorState, Input, Loading, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { CoursePicker } from '../../components/admin/Pickers'
import { optionalNumber, requiredNumber } from '../../lib/forms'
import { ProgramForm } from './Programs'

const addSchema = z.object({
  courseId: requiredNumber(z.number().int().positive('Choose a course'), 'Choose a course'),
  type: z.enum(['core', 'elective']),
  recommendedLevel: optionalNumber(z.number().int().min(100).max(900)),
})

export default function ProgramDetail() {
  const { id } = useParams()
  const program = useApi(`/programs/${id}`)
  const curriculum = useApi(`/programs/${id}/courses`)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)

  const add = useApiMutation((body) => http.post(`/programs/${id}/courses`, body), { success: 'Course added to the curriculum' })
  const remove = useApiMutation((courseId) => http.delete(`/programs/${id}/courses/${courseId}`), { success: 'Course removed from the curriculum' })
  // No PATCH exists for a curriculum entry, so switching core/elective is remove + re-add.
  const retype = useApiMutation(async (c) => {
    await http.delete(`/programs/${id}/courses/${c.id}`)
    return http.post(`/programs/${id}/courses`, {
      courseId: c.id, type: c.entry.type === 'core' ? 'elective' : 'core', ...(c.entry.recommendedLevel ? { recommendedLevel: c.entry.recommendedLevel } : {}),
    })
  }, { success: (_d, c) => `${c.code} is now ${c.entry.type === 'core' ? 'an elective' : 'a core course'}` })

  if (program.isPending) return <Loading />
  if (program.isError) return <ErrorState error={program.error} onRetry={() => program.refetch()} />
  const p = program.data
  const rows = (curriculum.data ?? []).map((c) => ({ ...c, entry: c.ProgramCourse ?? {} }))

  return (
    <div className="space-y-6">
      <Link to="/staff/programs" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Programs
      </Link>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <p className="text-sm font-semibold text-brand-700">{p.code}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{p.department?.name} · {p.durationYears} years · up to {p.maxCredits} credits per semester</p>
        </div>
        <Button variant="secondary" onClick={() => setEditing(p)}><Pencil className="size-4" /> Edit</Button>
      </Card>

      <Card>
        <CardHeader
          title={`Curriculum (${rows.length})`}
          subtitle="Students in this program can only register for these courses."
          action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add course</Button>}
        />
        <DataTable
          rows={rows}
          empty="No courses on this curriculum yet"
          emptyHint="Students in this program won't see any courses until you add some."
          columns={[
            { key: 'code', header: 'Course', render: (c) => <Link to={`/staff/courses/${c.id}`} className="font-medium hover:text-brand-700">{c.code}</Link> },
            { key: 'title', header: 'Title', render: (c) => <>{c.title} {c.status === 'inactive' && <Badge>inactive</Badge>}</> },
            { key: 'credits', header: 'Credits' },
            { key: 'level', header: 'Level' },
            { key: 'recommended', header: 'Recommended level', render: (c) => c.entry.recommendedLevel ?? '—' },
            { key: 'type', header: 'Type', render: (c) => <Badge tone={c.entry.type === 'core' ? 'blue' : 'slate'}>{c.entry.type}</Badge> },
            {
              key: 'actions', header: '', className: 'text-right', render: (c) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" loading={retype.isPending && retype.variables?.id === c.id} onClick={() => retype.mutate(c, { onError: (e) => toast.error(e.message) })}>
                    Make {c.entry.type === 'core' ? 'elective' : 'core'}
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Remove ${c.code}`} onClick={() => setRemoving(c)}><Trash2 className="size-4" /></Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <ProgramForm editing={editing} onClose={() => setEditing(null)} />

      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a course to the curriculum"
        schema={addSchema}
        defaultValues={{ courseId: '', type: 'core', recommendedLevel: '' }}
        onSubmit={(v) => add.mutateAsync(v)}
        submitLabel="Add course"
      >
        {({ control, register, formState: { errors } }) => (
          <>
            <Controller
              name="courseId"
              control={control}
              render={({ field }) => (
                <CoursePicker label="Course" value={field.value} onChange={(v) => field.onChange(v ?? '')} error={errors.courseId?.message} exclude={rows.map((r) => r.id)} />
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Type" {...register('type')}>
                <option value="core">Core</option>
                <option value="elective">Elective</option>
              </Select>
              <Input label="Recommended level (optional)" type="number" placeholder="e.g. 200" error={errors.recommendedLevel?.message} {...register('recommendedLevel')} />
            </div>
          </>
        )}
      </FormModal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.code}?`}
        confirmLabel="Remove"
        onConfirm={() => remove.mutateAsync(removing.id)}
      >
        <p>Students in {p.code} will no longer be able to register for {removing?.code}. Existing registrations are not changed.</p>
      </ConfirmDialog>
    </div>
  )
}
