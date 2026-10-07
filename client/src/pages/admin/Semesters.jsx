import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Plus, Star } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable, { stop } from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import DateTimeField from '../../components/DateTimeField'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { formatDate, formatDateTime } from '../../lib/format'
import { fromLocalInput, optionalNumber, requiredNumber, toLocalInput } from '../../lib/forms'
import { localDateTime } from '../../lib/dateTime'

const yearSchema = z.object({
  name: z.string().regex(/^\d{4}\/\d{4}$/, 'Use the form 2026/2027'),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().min(1, 'Required'),
}).refine((d) => d.endDate > d.startDate, { message: 'End must be after start', path: ['endDate'] })

// Mirrors createSemesterSchema in SCRS-backend src/validators/schedule.validator.js.
const semesterSchema = z.object({
  academicYearId: requiredNumber(z.number().int().positive('Choose an academic year'), 'Choose an academic year'),
  name: z.string().trim().min(2, 'At least 2 characters').max(50),
  term: optionalNumber(z.number().int().min(1).max(3)),
  startDate: z.string().min(1, 'Required'),
  endDate: z.string().min(1, 'Required'),
  registrationStart: localDateTime({ required: true }),
  registrationEnd: localDateTime({ required: true }),
  addDropEnd: localDateTime({ required: false }),
  minCredits: requiredNumber(z.number().int().min(0).max(60)),
  maxCredits: optionalNumber(z.number().int().min(1).max(60)),
  status: z.enum(['upcoming', 'active', 'completed']),
})
  .refine((d) => d.endDate > d.startDate, { message: 'End must be after start', path: ['endDate'] })
  .refine((d) => d.registrationEnd > d.registrationStart, { message: 'Must be after registration opens', path: ['registrationEnd'] })
  .refine((d) => !d.addDropEnd || d.addDropEnd > d.registrationStart, { message: 'Must be after registration opens', path: ['addDropEnd'] })
  .refine((d) => d.maxCredits == null || d.minCredits <= d.maxCredits, { message: 'Cannot exceed the maximum', path: ['minCredits'] })

const STATUS_TONE = { upcoming: 'amber', active: 'green', completed: 'slate' }

function AcademicYears() {
  const years = useApi('/academic-years')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/academic-years/${id}`, body) : http.post('/academic-years', body)), {
    success: (_d, v) => (v.id ? 'Academic year updated' : 'Academic year created'),
  })
  const [editing, setEditing] = useState(null)
  return (
    <Card>
      <CardHeader title="Academic years" action={<Button size="sm" variant="secondary" onClick={() => setEditing({})}><Plus className="size-4" /> New year</Button>} />
      <QueryState query={years}>
        {(rows) => (
          <DataTable
            rows={rows}
            empty="No academic years yet"
            columns={[
              { key: 'name', header: 'Year', render: (y) => <span className="font-medium">{y.name}</span> },
              { key: 'dates', header: 'Dates', render: (y) => `${formatDate(y.startDate)} – ${formatDate(y.endDate)}` },
              { key: 'semesters', header: 'Semesters', render: (y) => y.semesters?.map((s) => s.name).join(', ') || '—' },
              { key: 'edit', header: '', className: 'text-right', render: (y) => <Button size="sm" variant="ghost" aria-label={`Edit ${y.name}`} onClick={() => setEditing(y)}><Pencil className="size-4" /></Button> },
            ]}
          />
        )}
      </QueryState>
      <FormModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.name}` : 'New academic year'}
        schema={yearSchema}
        defaultValues={{ name: editing?.name ?? '', startDate: editing?.startDate ?? '', endDate: editing?.endDate ?? '' }}
        onSubmit={(v) => save.mutateAsync({ id: editing?.id, ...v })}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Input label="Name" placeholder="2027/2028" error={errors.name?.message} {...register('name')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Starts" type="date" error={errors.startDate?.message} {...register('startDate')} />
              <Input label="Ends" type="date" error={errors.endDate?.message} {...register('endDate')} />
            </div>
          </>
        )}
      </FormModal>
    </Card>
  )
}

export function SemesterForm({ editing, onClose, onSaved }) {
  const years = useApi('/academic-years')
  const save = useApiMutation(({ id, ...body }) => (id ? http.patch(`/semesters/${id}`, body) : http.post('/semesters', body)), {
    success: (_d, v) => (v.id ? 'Semester updated' : 'Semester created'),
  })
  const toBody = (v) => ({
    ...v,
    term: v.term ?? null, // blank clears it

    registrationStart: fromLocalInput(v.registrationStart),
    registrationEnd: fromLocalInput(v.registrationEnd),
    addDropEnd: fromLocalInput(v.addDropEnd),
  })
  return (
    <FormModal
      open={Boolean(editing)}
      onClose={onClose}
      wide
      title={editing?.id ? `Edit ${editing.name}` : 'New semester'}
      schema={semesterSchema}
      defaultValues={{
        academicYearId: editing?.academicYearId ?? '',
        name: editing?.name ?? '',
        term: editing?.term ?? '',
        startDate: editing?.startDate ?? '',
        endDate: editing?.endDate ?? '',
        registrationStart: toLocalInput(editing?.registrationStart),
        registrationEnd: toLocalInput(editing?.registrationEnd),
        addDropEnd: toLocalInput(editing?.addDropEnd),
        minCredits: editing?.minCredits ?? 0,
        maxCredits: editing?.maxCredits ?? '',
        status: editing?.status ?? 'upcoming',
      }}
      onSubmit={async (v) => {
        const saved = await save.mutateAsync({ id: editing?.id, ...toBody(v) })
        onSaved?.(saved)
      }}
    >
      {({ control, register, formState: { errors } }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Academic year" error={errors.academicYearId?.message} {...register('academicYearId')}>
              <option value="">Select year</option>
              {years.data?.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
            <Input label="Name" placeholder="e.g. First Semester" error={errors.name?.message} {...register('name')} />
            <Select label="Term of the year" error={errors.term?.message} {...register('term')}>
              <option value="">Not set</option>
              {[1, 2, 3].map((t) => <option key={t} value={t}>Semester {t}</option>)}
            </Select>
          </div>
          <p className="-mt-2 text-xs text-slate-500">Courses a curriculum places in a specific semester are only offered to students when this matches.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Classes start" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <Input label="Classes end" type="date" error={errors.endDate?.message} {...register('endDate')} />
          </div>
          <fieldset className="grid gap-4 rounded-lg bg-slate-50 p-4">
            <legend className="px-1 text-sm font-medium text-slate-700">Registration period (your local time)</legend>
            <Controller name="registrationStart" control={control} render={({ field }) => (
              <DateTimeField label="Opens" hint="Registration windows can open later" error={errors.registrationStart?.message} {...field} />
            )} />
            <Controller name="registrationEnd" control={control} render={({ field }) => (
              <DateTimeField label="Closes" error={errors.registrationEnd?.message} {...field} />
            )} />
            <Controller name="addDropEnd" control={control} render={({ field }) => (
              <DateTimeField label="Add/drop ends (optional)" hint="Submitted students can still change until then" error={errors.addDropEnd?.message} {...field} />
            )} />
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Min credits" type="number" error={errors.minCredits?.message} {...register('minCredits')} />
            <Input label="Max credits (optional)" type="number" hint={editing?.maxCredits ? 'Once set it can be changed but not cleared' : "Empty = use each program's limit"} error={errors.maxCredits?.message} {...register('maxCredits')} />
            <Select label="Status" {...register('status')}>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </Select>
          </div>
        </>
      )}
    </FormModal>
  )
}

export function MakeCurrentDialog({ semester, onClose }) {
  const makeCurrent = useApiMutation((id) => http.patch(`/semesters/${id}`, { isCurrent: true }), { success: (_d) => 'Current semester changed' })
  return (
    <ConfirmDialog
      open={Boolean(semester)}
      onClose={onClose}
      title={`Make ${semester?.name} the current semester?`}
      confirmLabel="Make current"
      danger={false}
      onConfirm={() => makeCurrent.mutateAsync(semester.id)}
    >
      <p>All student registration, the course catalog and timetables switch to this semester immediately. The previous current semester stops being current.</p>
    </ConfirmDialog>
  )
}

export default function Semesters() {
  const navigate = useNavigate()
  const semesters = useApi('/semesters', { limit: 100 })
  const [editing, setEditing] = useState(null)
  const [promoting, setPromoting] = useState(null)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Semesters"
        subtitle="Registration always runs against the current semester."
        action={<Button onClick={() => setEditing({})}><Plus className="size-4" /> New semester</Button>}
      />
      <Card>
        <QueryState query={semesters}>
          {({ items }) => (
            <DataTable
              rows={items}
              empty="No semesters yet"
              onRowClick={(s) => navigate(`/staff/semesters/${s.id}`)}
              columns={[
                { key: 'name', header: 'Semester', render: (s) => <span className="font-medium">{s.name} {s.isCurrent && <Badge tone="blue">Current</Badge>}</span> },
                { key: 'year', header: 'Year', render: (s) => s.academicYear?.name },
                { key: 'dates', header: 'Classes', render: (s) => `${formatDate(s.startDate)} – ${formatDate(s.endDate)}` },
                { key: 'reg', header: 'Registration', render: (s) => <span className="text-slate-600">{formatDateTime(s.registrationStart)} → {formatDateTime(s.registrationEnd)}</span> },
                { key: 'credits', header: 'Credits', render: (s) => `${s.minCredits}–${s.maxCredits ?? 'program'}` },
                { key: 'status', header: 'Status', render: (s) => <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge> },
                {
                  key: 'actions', header: '', className: 'text-right', render: (s) => (
                    <div className="flex justify-end gap-1">
                      {!s.isCurrent && <Button size="sm" variant="ghost" className="whitespace-nowrap" onClick={stop(() => setPromoting(s))}><Star className="size-4" /> Make current</Button>}
                      <Button size="sm" variant="ghost" aria-label={`Edit ${s.name}`} onClick={stop(() => setEditing(s))}><Pencil className="size-4" /></Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <AcademicYears />
      <SemesterForm editing={editing} onClose={() => setEditing(null)} />
      <MakeCurrentDialog semester={promoting} onClose={() => setPromoting(null)} />
    </div>
  )
}
