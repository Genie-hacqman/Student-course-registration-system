import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Star, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, ErrorState, Input, Loading, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Textarea } from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { StudentPicker } from '../../components/admin/Pickers'
import { formatDate, formatDateTime, fullName } from '../../lib/format'
import { fromLocalInput, optionalNumber, requiredNumber, toLocalInput, toLocalInputCeil } from '../../lib/forms'
import { MakeCurrentDialog, SemesterForm } from './Semesters'

const windowSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100),
  minLevel: optionalNumber(z.number().int().min(100).max(900)),
  programId: optionalNumber(z.number().int().positive()),
  opensAt: z.string().min(1, 'Required'),
})

const overrideSchema = z.object({
  studentId: requiredNumber(z.number().int().positive('Choose a student'), 'Choose a student'),
  opensAt: z.string().min(1, 'Required'),
  reason: z.string().trim().min(5, 'At least 5 characters').max(500),
})

function Windows({ semester }) {
  const base = `/semesters/${semester.id}/priority-windows`
  const windows = useApi(base)
  const programs = useApi('/programs')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`${base}/${id}`, body) : http.post(base, body)), {
    success: (_d, v) => (v.id ? 'Window updated' : 'Window added'),
  })
  const remove = useApiMutation((id) => http.delete(`${base}/${id}`), { success: 'Window removed' })
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const toBody = (v) => ({
    name: v.name,
    opensAt: fromLocalInput(v.opensAt),
    // null clears a condition on update; omitted fields would keep the old value.
    minLevel: v.minLevel ?? (editing?.id ? null : undefined),
    programId: v.programId ?? (editing?.id ? null : undefined),
  })

  return (
    <Card>
      <CardHeader
        title="Registration windows"
        subtitle="Stagger when groups of students can start registering. A student uses the earliest window they match; with no windows, everyone starts when registration opens."
        action={<Button size="sm" onClick={() => setEditing({})}><Plus className="size-4" /> Add window</Button>}
      />
      <DataTable
        rows={windows.data ?? []}
        empty="No windows — everyone starts when registration opens"
        columns={[
          { key: 'name', header: 'Name', render: (w) => <span className="font-medium">{w.name}</span> },
          { key: 'who', header: 'Applies to', render: (w) => [w.minLevel && `Level ${w.minLevel}+`, w.program?.code].filter(Boolean).join(' · ') || 'Everyone' },
          { key: 'opensAt', header: 'Opens', render: (w) => formatDateTime(w.opensAt) },
          {
            key: 'actions', header: '', className: 'text-right', render: (w) => (
              <div className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" aria-label={`Edit ${w.name}`} onClick={() => setEditing(w)}><Pencil className="size-4" /></Button>
                <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Delete ${w.name}`} onClick={() => setDeleting(w)}><Trash2 className="size-4" /></Button>
              </div>
            ),
          },
        ]}
      />
      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'New registration window'}
        schema={windowSchema}
        defaultValues={{ name: editing?.name ?? '', minLevel: editing?.minLevel ?? '', programId: editing?.programId ?? '', opensAt: toLocalInput(editing?.opensAt) }}
        onSubmit={(v) => save.mutateAsync({ id: editing?.id, ...toBody(v) })}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Input label="Name" placeholder="e.g. Final-year students" error={errors.name?.message} {...register('name')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Minimum level (optional)" type="number" placeholder="e.g. 400" error={errors.minLevel?.message} {...register('minLevel')} />
              <Select label="Program (optional)" {...register('programId')}>
                <option value="">Any program</option>
                {programs.data?.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
              </Select>
            </div>
            <Input
              label="Opens at (your local time)"
              type="datetime-local"
              hint={`Must be between ${formatDateTime(semester.registrationStart)} and ${formatDateTime(semester.registrationEnd)}`}
              error={errors.opensAt?.message}
              {...register('opensAt')}
            />
          </>
        )}
      </FormModal>
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title={`Remove ${deleting?.name}?`} confirmLabel="Remove" onConfirm={() => remove.mutateAsync(deleting.id)}>
        <p>Students in this window will fall back to the other windows.</p>
      </ConfirmDialog>
    </Card>
  )
}

function EarlyAccess({ semester }) {
  const base = `/semesters/${semester.id}/registration-overrides`
  const overrides = useApi(base)
  const save = useApiMutation((body) => http.put(base, body), { success: 'Early registration granted' })
  const remove = useApiMutation((studentId) => http.delete(`${base}/${studentId}`), { success: 'Exception removed' })
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)

  return (
    <Card>
      <CardHeader
        title="Early-registration exceptions"
        subtitle="Individual students (e.g. athletes, accessibility accommodations) who may register earlier than their window. The student is notified."
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add exception</Button>}
      />
      <DataTable
        rows={overrides.data ?? []}
        empty="No exceptions"
        columns={[
          { key: 'student', header: 'Student', render: (o) => <><span className="font-medium">{fullName(o.student?.user)}</span> <span className="text-slate-500">{o.student?.studentNumber}</span></> },
          { key: 'opensAt', header: 'May register from', render: (o) => formatDateTime(o.opensAt) },
          { key: 'reason', header: 'Reason', className: 'max-w-xs', render: (o) => <span className="text-slate-600">{o.reason}</span> },
          { key: 'actions', header: '', className: 'text-right', render: (o) => <Button size="sm" variant="ghost" className="text-red-600" aria-label="Remove exception" onClick={() => setDeleting(o)}><Trash2 className="size-4" /></Button> },
        ]}
      />
      <FormModal
        open={adding}
        onClose={() => setAdding(false)}
        title="Grant early registration"
        schema={overrideSchema}
        defaultValues={{ studentId: '', opensAt: toLocalInputCeil(semester.registrationStart), reason: '' }}
        onSubmit={(v) => save.mutateAsync({ ...v, opensAt: fromLocalInput(v.opensAt) })}
        submitLabel="Grant"
      >
        {({ control, register, formState: { errors } }) => (
          <>
            <Controller
              name="studentId"
              control={control}
              render={({ field }) => <StudentPicker label="Student" value={field.value} onChange={(v) => field.onChange(v ?? '')} error={errors.studentId?.message} />}
            />
            <Input label="May register from (your local time)" type="datetime-local" error={errors.opensAt?.message} {...register('opensAt')} />
            <Textarea label="Reason" error={errors.reason?.message} {...register('reason')} />
            <p className="text-xs text-slate-500">If the student already has an exception this semester, it's replaced.</p>
          </>
        )}
      </FormModal>
      <ConfirmDialog open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Remove this exception?" confirmLabel="Remove" onConfirm={() => remove.mutateAsync(deleting.student.id)}>
        <p>{fullName(deleting?.student?.user)} will register in their normal window.</p>
      </ConfirmDialog>
    </Card>
  )
}

export default function SemesterDetail() {
  const { id } = useParams()
  const semester = useApi(`/semesters/${id}`)
  const [editing, setEditing] = useState(null)
  const [promoting, setPromoting] = useState(null)

  if (semester.isPending) return <Loading />
  if (semester.isError) return <ErrorState error={semester.error} onRetry={() => semester.refetch()} />
  const s = semester.data

  return (
    <div className="space-y-6">
      <Link to="/staff/semesters" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Semesters
      </Link>
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{s.name} {s.isCurrent && <Badge tone="blue">Current</Badge>}</h1>
            <p className="mt-1 text-sm text-slate-500">{s.academicYear?.name} · classes {formatDate(s.startDate)} – {formatDate(s.endDate)}</p>
          </div>
          <div className="flex gap-2">
            {!s.isCurrent && <Button variant="secondary" onClick={() => setPromoting(s)}><Star className="size-4" /> Make current</Button>}
            <Button variant="secondary" onClick={() => setEditing(s)}><Pencil className="size-4" /> Edit</Button>
            <Link to={`/staff/sections?semester=${s.id}`}><Button variant="secondary">Sections</Button></Link>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-slate-500">Registration opens</dt><dd className="font-medium">{formatDateTime(s.registrationStart)}</dd></div>
          <div><dt className="text-slate-500">Registration closes</dt><dd className="font-medium">{formatDateTime(s.registrationEnd)}</dd></div>
          <div><dt className="text-slate-500">Add/drop ends</dt><dd className="font-medium">{formatDateTime(s.addDropEnd)}</dd></div>
          <div><dt className="text-slate-500">Credits</dt><dd className="font-medium">{s.minCredits} – {s.maxCredits ?? "program's limit"}</dd></div>
        </dl>
      </Card>
      <Windows semester={s} />
      <EarlyAccess semester={s} />
      <SemesterForm editing={editing} onClose={() => setEditing(null)} />
      <MakeCurrentDialog semester={promoting} onClose={() => setPromoting(null)} />
    </div>
  )
}
