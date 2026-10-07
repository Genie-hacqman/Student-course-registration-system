import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Power, Trash2, X } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, Select } from '../../components/ui'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { CoursePicker } from '../../components/admin/Pickers'
import { lecturerName } from '../../lib/format'
import { useAuth } from '../../auth/AuthProvider'
import { PERMS, can } from '../../lib/roles'
import { CourseForm } from './Courses'

const GRADES = ['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'E']

const requirementSchema = z.object({
  type: z.enum(['prerequisite', 'corequisite']),
  courseIds: z.array(z.number()).min(1, 'Choose at least one course').max(10),
  minGrade: z.string().optional(),
}).refine((d) => !(d.type === 'corequisite' && d.minGrade), { message: 'Corequisites cannot have a minimum grade', path: ['minGrade'] })

const toGroups = (rows) => {
  const groups = new Map()
  rows.forEach((r) => {
    const key = `${r.type}-${r.groupNo ?? `solo-${r.id}`}`
    if (!groups.has(key)) groups.set(key, { type: r.type, minGrade: r.minGrade, courses: [] })
    groups.get(key).courses.push(r)
  })
  return [...groups.values()]
}

function RequirementForm({ open, onClose, course, existing }) {
  const add = useApiMutation((v) => http.post(`/courses/${course.id}/prerequisites`, {
    type: v.type,
    ...(v.courseIds.length === 1 ? { prerequisiteCourseId: v.courseIds[0] } : { anyOf: v.courseIds }),
    ...(v.minGrade ? { minGrade: v.minGrade } : {}),
  }), { success: 'Requirement added' })
  const [labels, setLabels] = useState({})

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={`Add a requirement to ${course.code}`}
      schema={requirementSchema}
      defaultValues={{ type: 'prerequisite', courseIds: [], minGrade: '' }}
      onSubmit={(v) => add.mutateAsync(v)}
      submitLabel="Add requirement"
    >
      {({ control, register, watch, formState: { errors } }) => (
        <>
          <Select label="Type" {...register('type')}>
            <option value="prerequisite">Prerequisite — must be passed before</option>
            <option value="corequisite">Corequisite — taken in the same semester</option>
          </Select>
          <Controller
            name="courseIds"
            control={control}
            render={({ field }) => (
              <div className="space-y-2">
                <CoursePicker
                  label={field.value.length ? 'Add an alternative (optional)' : 'Required course'}
                  value={undefined}
                  exclude={[course.id, ...existing, ...field.value]}
                  onChange={(courseId, option) => {
                    if (!courseId) return
                    setLabels((l) => ({ ...l, [courseId]: option.label }))
                    field.onChange([...field.value, courseId])
                  }}
                  error={errors.courseIds?.message}
                />
                {field.value.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {field.value.length > 1 && <span className="text-slate-500">Any one of:</span>}
                    {field.value.map((cid) => (
                      <span key={cid} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
                        {labels[cid]}
                        <button type="button" aria-label={`Remove ${labels[cid]}`} onClick={() => field.onChange(field.value.filter((x) => x !== cid))}>
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">Choose several courses to accept any one of them.</p>
              </div>
            )}
          />
          {watch('type') === 'prerequisite' && (
            <Select label="Minimum grade (optional)" error={errors.minGrade?.message} {...register('minGrade')}>
              <option value="">Passing grade (system default)</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </Select>
          )}
        </>
      )}
    </FormModal>
  )
}

export default function CourseDetail() {
  const { id } = useParams()
  const course = useApi(`/courses/${id}`)
  const requirements = useApi(`/courses/${id}/prerequisites`)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const [toggling, setToggling] = useState(false)
  const { user } = useAuth()
  const canEdit = can(user, PERMS.COURSE_CATALOG)

  const removeReq = useApiMutation((courseId) => http.delete(`/courses/${id}/prerequisites/${courseId}`), { success: 'Requirement removed' })
  const setActive = useApiMutation((active) => (active ? http.patch(`/courses/${id}`, { status: 'active' }) : http.delete(`/courses/${id}`)), {
    success: (_d, active) => (active ? 'Course restored' : 'Course archived'),
  })

  if (course.isPending) return <Loading />
  if (course.isError) return <ErrorState error={course.error} onRetry={() => course.refetch()} />
  const c = course.data
  const active = c.status === 'active'
  const groups = toGroups(requirements.data ?? [])

  return (
    <div className="space-y-6">
      <Link to="/staff/courses" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Courses
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-brand-700">{c.code}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{c.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="blue">{c.credits} credits</Badge>
              <Badge>Level {c.level}</Badge>
              {c.department && <Badge>{c.department.name}</Badge>}
              <Badge tone={active ? 'green' : 'slate'}>{active ? 'Active' : 'Archived'}</Badge>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setToggling(true)}><Power className="size-4" /> {active ? 'Archive' : 'Restore'}</Button>
              <Button variant="secondary" onClick={() => setEditing(c)}><Pencil className="size-4" /> Edit</Button>
            </div>
          )}
        </div>
        <p className="mt-4 text-sm whitespace-pre-line text-slate-600">{c.description || 'No description.'}</p>
      </Card>

      <Card>
        <CardHeader
          title="Requirements"
          subtitle="Every line is required. Courses on one line are alternatives — passing any one of them is enough."
          action={canEdit && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add requirement</Button>}
        />
        {groups.length ? (
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.courses.map((r) => r.id).join('-')} className="flex flex-wrap items-center gap-2 px-5 py-3 text-sm">
                <Badge tone={g.type === 'prerequisite' ? 'blue' : 'amber'}>{g.type}</Badge>
                {g.courses.length > 1 && <span className="text-slate-500">One of</span>}
                {g.courses.map((r, i) => (
                  <span key={r.id} className="inline-flex items-center gap-1">
                    {i > 0 && <span className="text-slate-400">or</span>}
                    <Link to={`/staff/courses/${r.id}`} className="font-medium hover:text-brand-700">{r.code}</Link>
                    <span className="text-slate-500">{r.title}</span>
                    {canEdit && (
                      <button className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${r.code}`} onClick={() => setRemoving(r)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </span>
                ))}
                {g.minGrade && <span className="text-slate-500">· minimum grade {g.minGrade}</span>}
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No requirements" />}
      </Card>

      <Card>
        <CardHeader title={`Sections (${c.sections?.length ?? 0})`} action={<Link to={`/staff/sections?course=${c.id}`}><Button size="sm" variant="secondary">Manage sections</Button></Link>} />
        {c.sections?.length ? (
          <ul className="divide-y divide-slate-100">
            {c.sections.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <Link to={`/staff/sections/${s.id}`} className="font-medium hover:text-brand-700">
                  {s.semester?.name} · Section {s.sectionCode}
                </Link>
                <span className="text-slate-500">{lecturerName(s.lecturer)} · {s.seatsTaken}/{s.capacity} · {s.status}</span>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="Not offered in any semester yet" />}
      </Card>

      <CourseForm editing={editing} onClose={() => setEditing(null)} />
      <RequirementForm open={adding} onClose={() => setAdding(false)} course={c} existing={(requirements.data ?? []).map((r) => r.id)} />

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.code} as a requirement?`}
        confirmLabel="Remove"
        onConfirm={() => removeReq.mutateAsync(removing.id)}
      >
        <p>{c.code} will no longer require {removing?.code}.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={toggling}
        onClose={() => setToggling(false)}
        title={active ? `Archive ${c.code}?` : `Restore ${c.code}?`}
        confirmLabel={active ? 'Archive' : 'Restore'}
        danger={active}
        onConfirm={() => setActive.mutateAsync(!active)}
      >
        <p>
          {active
            ? 'Students will no longer see it and new sections can’t be opened. Existing registrations and results are kept.'
            : 'Students on a program whose curriculum includes it will see it again.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}
