import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, X } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { PERMS, can } from '../../lib/roles'
import { Badge, Button, Card, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Checkbox } from '../../components/admin/FormModal'
import { CoursePicker, LecturerSelect } from '../../components/admin/Pickers'
import { SemesterSelect, useSemesterParam } from '../../components/staff'
import { DAY_NAMES, formatTime, lecturerName } from '../../lib/format'
import { optionalNumber, requiredNumber } from '../../lib/forms'

export const SECTION_TONE = { open: 'green', closed: 'amber', cancelled: 'slate' }

const createSchema = z.object({
  courseId: requiredNumber(z.number().int().positive('Choose a course'), 'Choose a course'),
  sectionCode: z.string().trim().min(1, 'Required').max(10),
  capacity: requiredNumber(z.number().int().min(1).max(2000)),
  lecturerId: optionalNumber(z.number().int().positive()),
  waitlistEnabled: z.boolean(),
})

export const timetableSummary = (schedules) =>
  schedules?.length
    ? schedules.map((s) => `${DAY_NAMES[s.day].slice(0, 3)} ${formatTime(s.startTime)}`).join(', ')
    : 'No timetable yet'

export default function Sections() {
  const { user } = useAuth()
  const canAssign = can(user, PERMS.LECTURER_ASSIGN)
  const canManage = can(user, PERMS.SECTION_MANAGE)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { semesterId, setSemesterId, semesters, semester } = useSemesterParam()
  const courseId = params.get('course')
  const course = useApi(courseId ? `/courses/${courseId}` : null)
  const status = params.get('status') ?? ''
  const page = Number(params.get('page') ?? 1)
  const sections = useApi(semesterId ? '/sections' : null, {
    semesterId, courseId: courseId || undefined, status: status || undefined, page, limit: 25,
  })
  const [creating, setCreating] = useState(false)
  const create = useApiMutation((body) => http.post('/sections', body), { success: 'Section created' })

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
        title="Sections"
        subtitle="Each section is one offering of a course in a semester, with its own capacity, lecturer and timetable."
        action={canManage && <Button disabled={!semesterId} onClick={() => setCreating(true)}><Plus className="size-4" /> New section</Button>}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />
        <Select value={status} onChange={(e) => set('status', e.target.value)} aria-label="Status" className="w-44">
          <option value="">Any status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </Select>
        {courseId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            {course.data?.code ?? 'Course'}
            <button onClick={() => set('course', '')} aria-label="Clear course filter"><X className="size-3.5" /></button>
          </span>
        )}
      </Card>
      <Card>
        <QueryState query={sections}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty={`No sections in ${semester?.name ?? 'this semester'}`}
              onRowClick={(s) => navigate(`/staff/sections/${s.id}`)}
              columns={[
                { key: 'course', header: 'Course', render: (s) => <><span className="font-medium">{s.course?.code}</span> <span className="text-slate-500">{s.course?.title}</span></> },
                { key: 'sectionCode', header: 'Section' },
                { key: 'lecturer', header: 'Lecturer', render: (s) => lecturerName(s.lecturer) },
                { key: 'seats', header: 'Seats', render: (s) => <span className="tabular-nums">{s.seatsTaken} / {s.capacity}</span> },
                { key: 'timetable', header: 'Timetable', render: (s) => <span className="text-slate-600">{timetableSummary(s.schedules)}</span> },
                { key: 'status', header: 'Status', render: (s) => <Badge tone={SECTION_TONE[s.status]}>{s.status}</Badge> },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <FormModal
        open={creating}
        onClose={() => setCreating(false)}
        title={`New section · ${semester?.name ?? ''}`}
        schema={createSchema}
        defaultValues={{ courseId: courseId ? Number(courseId) : '', sectionCode: 'A', capacity: 40, lecturerId: '', waitlistEnabled: true }}
        onSubmit={async (v) => {
          const { lecturerId, ...rest } = v
          const created = await create.mutateAsync({ ...rest, ...(canAssign && lecturerId ? { lecturerId } : {}), semesterId: Number(semesterId) })
          navigate(`/staff/sections/${created.id}`)
        }}
        submitLabel="Create section"
      >
        {({ control, register, formState: { errors } }) => (
          <>
            {courseId && course.data ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{course.data.code}</span> {course.data.title}</p>
            ) : (
              <Controller
                name="courseId"
                control={control}
                render={({ field }) => <CoursePicker label="Course" value={field.value} onChange={(v) => field.onChange(v ?? '')} error={errors.courseId?.message} extraParams={{ status: 'active' }} />}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Section code" error={errors.sectionCode?.message} {...register('sectionCode')} />
              <Input label="Capacity" type="number" error={errors.capacity?.message} {...register('capacity')} />
            </div>
            {canAssign
              ? <LecturerSelect error={errors.lecturerId?.message} {...register('lecturerId')} />
              : <p className="text-xs text-slate-500">The registry assigns the lecturer (Course assignments).</p>}
            <Checkbox label="Waitlist when full" hint="Also needs waitlists switched on in system settings" {...register('waitlistEnabled')} />
            <p className="text-xs text-slate-500">Add the timetable after creating the section.</p>
          </>
        )}
      </FormModal>
    </div>
  )
}
