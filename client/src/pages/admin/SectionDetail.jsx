import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, ErrorState, Input, Loading, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Checkbox } from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import ClashList, { isClash } from '../../components/admin/ClashList'
import { LecturerSelect } from '../../components/admin/Pickers'
import { DAY_NAMES, DAY_ORDER, formatTime, lecturerName } from '../../lib/format'
import { optionalNumber, requiredNumber } from '../../lib/forms'
import { SECTION_TONE } from './Sections'

const editSchema = z.object({
  sectionCode: z.string().trim().min(1, 'Required').max(10),
  capacity: requiredNumber(z.number().int().min(1).max(2000)),
  lecturerId: optionalNumber(z.number().int().positive()),
  status: z.enum(['open', 'closed', 'cancelled']),
  waitlistEnabled: z.boolean(),
})

const slotSchema = z.object({
  day: z.enum(DAY_ORDER),
  startTime: z.string().regex(/^\d{2}:\d{2}/, 'Required'),
  endTime: z.string().regex(/^\d{2}:\d{2}/, 'Required'),
  room: z.string().trim().max(50).optional(),
}).refine((d) => d.endTime > d.startTime, { message: 'Must be after the start', path: ['endTime'] })

export default function SectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const section = useApi(`/sections/${id}`)
  const [editing, setEditing] = useState(false)
  const [slot, setSlot] = useState(null)
  const [removingSlot, setRemovingSlot] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [clash, setClash] = useState(null)

  const update = useApiMutation((body) => http.patch(`/sections/${id}`, body), { success: 'Section updated' })
  const saveSlot = useApiMutation(({ id: slotId, ...body }) => (slotId ? http.patch(`/schedules/${slotId}`, body) : http.post('/schedules', { ...body, courseSectionId: Number(id) })), {
    success: (_d, v) => (v.id ? 'Class time updated' : 'Class time added'),
  })
  const removeSlot = useApiMutation((slotId) => http.delete(`/schedules/${slotId}`), { success: 'Class time removed' })
  const remove = useApiMutation(() => http.delete(`/sections/${id}`), { success: 'Section removed' })

  const showClash = (err) => {
    if (!isClash(err)) return false
    setClash(err)
    return true
  }
  const closeSlot = () => {
    setSlot(null)
    setClash(null)
  }

  if (section.isPending) return <Loading />
  if (section.isError) return <ErrorState error={section.error} onRetry={() => section.refetch()} />
  const s = section.data
  const slots = [...(s.schedules ?? [])].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime))

  return (
    <div className="space-y-6">
      <Link to={`/staff/sections?semester=${s.semesterId}`} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Sections
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link to={`/staff/courses/${s.course?.id}`} className="text-sm font-semibold text-brand-700 hover:underline">{s.course?.code}</Link>
            <h1 className="text-2xl font-semibold tracking-tight">{s.course?.title} · Section {s.sectionCode}</h1>
            <p className="mt-1 text-sm text-slate-500">{s.semester?.name}</p>
          </div>
          <div className="flex gap-2">
            <Link to={`/staff/sections/${s.id}/class`}><Button variant="secondary"><Users className="size-4" /> Class list & grades</Button></Link>
            <Button variant="secondary" className="text-red-600" onClick={() => setDeleting(true)}><Trash2 className="size-4" /> Delete</Button>
            <Button variant="secondary" onClick={() => { setClash(null); setEditing(true) }}><Pencil className="size-4" /> Edit</Button>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-5">
          <div><dt className="text-slate-500">Status</dt><dd><Badge tone={SECTION_TONE[s.status]}>{s.status}</Badge></dd></div>
          <div><dt className="text-slate-500">Seats taken</dt><dd className="font-medium tabular-nums">{s.seatsTaken} / {s.capacity}</dd></div>
          <div><dt className="text-slate-500">Lecturer</dt><dd className="font-medium">{lecturerName(s.lecturer)}</dd></div>
          <div><dt className="text-slate-500">Waitlist</dt><dd className="font-medium">{s.waitlistEnabled ? 'On' : 'Off'}</dd></div>
          <div><dt className="text-slate-500">Credits</dt><dd className="font-medium">{s.course?.credits}</dd></div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Timetable"
          subtitle="Room and lecturer clashes with other sections this semester are checked when you save."
          action={<Button size="sm" onClick={() => { setClash(null); setSlot({}) }}><Plus className="size-4" /> Add class time</Button>}
        />
        <DataTable
          rows={slots}
          empty="No class times yet"
          emptyHint="Students see 'Schedule to be announced' until you add one."
          columns={[
            { key: 'day', header: 'Day', render: (x) => <span className="font-medium">{DAY_NAMES[x.day]}</span> },
            { key: 'time', header: 'Time', render: (x) => `${formatTime(x.startTime)} – ${formatTime(x.endTime)}` },
            { key: 'room', header: 'Room', render: (x) => x.room || '—' },
            {
              key: 'actions', header: '', className: 'text-right', render: (x) => (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" aria-label="Edit class time" onClick={() => { setClash(null); setSlot(x) }}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" aria-label="Remove class time" onClick={() => setRemovingSlot(x)}><Trash2 className="size-4" /></Button>
                </div>
              ),
            },
          ]}
        />
      </Card>

      <FormModal
        open={editing}
        onClose={() => { setEditing(false); setClash(null) }}
        title={`Edit section ${s.sectionCode}`}
        schema={editSchema}
        defaultValues={{ sectionCode: s.sectionCode, capacity: s.capacity, lecturerId: s.lecturerId ?? '', status: s.status, waitlistEnabled: s.waitlistEnabled }}
        onSubmit={(v) => update.mutateAsync({ ...v, lecturerId: v.lecturerId ?? null })}
        onError={showClash}
      >
        {({ register, watch, formState: { errors } }) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Section code" error={errors.sectionCode?.message} {...register('sectionCode')} />
              <Input label="Capacity" type="number" hint={`${s.seatsTaken} seats already taken`} error={errors.capacity?.message} {...register('capacity')} />
            </div>
            <LecturerSelect error={errors.lecturerId?.message} {...register('lecturerId')} />
            <Select label="Status" {...register('status')}>
              <option value="open">Open — students can register</option>
              <option value="closed">Closed — no new registrations</option>
              <option value="cancelled">Cancelled</option>
            </Select>
            {watch('status') === 'cancelled' && s.status !== 'cancelled' && s.seatsTaken > 0 && (
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                {s.seatsTaken} students are registered. Cancelling doesn't drop them — contact them and have them drop or switch sections.
              </p>
            )}
            <Checkbox label="Waitlist when full" {...register('waitlistEnabled')} />
            <ClashList error={clash} />
          </>
        )}
      </FormModal>

      <FormModal
        open={Boolean(slot)}
        onClose={closeSlot}
        title={slot?.id ? 'Edit class time' : 'Add class time'}
        schema={slotSchema}
        defaultValues={{ day: slot?.day ?? 'MON', startTime: slot?.startTime?.slice(0, 5) ?? '', endTime: slot?.endTime?.slice(0, 5) ?? '', room: slot?.room ?? '' }}
        onSubmit={(v) => saveSlot.mutateAsync({ id: slot?.id, ...v, room: v.room || undefined })}
        onError={showClash}
      >
        {({ register, formState: { errors } }) => (
          <>
            <Select label="Day" {...register('day')}>
              {DAY_ORDER.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
            </Select>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Starts" type="time" error={errors.startTime?.message} {...register('startTime')} />
              <Input label="Ends" type="time" error={errors.endTime?.message} {...register('endTime')} />
            </div>
            <Input label="Room" placeholder="e.g. LAB-1" error={errors.room?.message} {...register('room')} />
            <ClashList error={clash} />
          </>
        )}
      </FormModal>

      <ConfirmDialog open={Boolean(removingSlot)} onClose={() => setRemovingSlot(null)} title="Remove this class time?" confirmLabel="Remove" onConfirm={() => removeSlot.mutateAsync(removingSlot.id)}>
        <p>{removingSlot && `${DAY_NAMES[removingSlot.day]} ${formatTime(removingSlot.startTime)}–${formatTime(removingSlot.endTime)}`} will be removed from registered students' timetables.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete section ${s.sectionCode}?`}
        confirmLabel="Delete"
        onConfirm={async () => {
          await remove.mutateAsync()
          navigate(`/staff/sections?semester=${s.semesterId}`)
        }}
      >
        <p>A section with registered students can't be deleted — set its status to cancelled instead.</p>
      </ConfirmDialog>
    </div>
  )
}
