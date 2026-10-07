import { useState } from 'react'
import { CalendarCheck, CheckCheck, Pencil, Trash2, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import {
  useAttendanceSession, useCreateAttendance, useDeleteAttendance, useSectionAttendance, useUpdateAttendance,
} from '../../api/attendance'
import {
  Button, Card, CardHeader, EmptyState, ErrorState, Input, Modal, ProgressBar, Select, SkeletonList, SkeletonTable, StatusBadge, cx,
} from '../ui'
import ConfirmDialog from '../admin/ConfirmDialog'
import { today } from '../../lib/teaching'
import { DAY_NAMES, formatDate, formatTime } from '../../lib/format'

const STATUSES = [
  ['present', 'Present', 'P', 'peer-checked:bg-green-600 peer-checked:text-white peer-checked:ring-green-600'],
  ['late', 'Late', 'L', 'peer-checked:bg-amber-500 peer-checked:text-white peer-checked:ring-amber-500'],
  ['absent', 'Absent', 'A', 'peer-checked:bg-red-600 peer-checked:text-white peer-checked:ring-red-600'],
  ['excused', 'Excused', 'E', 'peer-checked:bg-brand-600 peer-checked:text-white peer-checked:ring-brand-600'],
]

function StatusPicker({ name, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1">
      {STATUSES.map(([status, text, short, checkedCls]) => (
        <label key={status} className="relative">
          <input type="radio" name={name} value={status} checked={value === status} onChange={() => onChange(status)} className="peer sr-only" />
          <span
            title={text}
            className={cx(
              'flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition',
              'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600 hover:bg-slate-50',
              checkedCls,
            )}
          >
            <span className="sm:hidden" aria-hidden>{short}</span>
            <span className="hidden sm:inline">{text}</span>
            <span className="sr-only sm:hidden">{text}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

function RosterMarker({ students, marks, setMarks, idPrefix }) {
  const counts = STATUSES.map(([s, text]) => [text, students.filter((st) => (marks[st.studentId] ?? 'present') === s).length])
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500" aria-live="polite">{counts.map(([t, n]) => `${n} ${t.toLowerCase()}`).join(' · ')}</p>
        <Button size="sm" variant="secondary" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, 'present'])))}>
          <CheckCheck className="size-4" aria-hidden /> Mark all present
        </Button>
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
        {students.map((s) => (
          <li key={s.studentId} className="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{s.name}</span>
              <span className="block text-xs text-slate-500">{s.studentNumber}</span>
            </span>
            <StatusPicker
              name={`${idPrefix}-${s.studentId}`}
              label={`Attendance for ${s.name}`}
              value={marks[s.studentId] ?? 'present'}
              onChange={(v) => setMarks((m) => ({ ...m, [s.studentId]: v }))}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

function TakeAttendance({ section, students, initialSlot, onExisting }) {
  const create = useCreateAttendance()
  const todays = section.schedules?.filter((s) => s.day === today().day) ?? []
  const [date, setDate] = useState(today().date)
  const [scheduleId, setScheduleId] = useState(initialSlot ?? (todays[0]?.id ? String(todays[0].id) : ''))
  const [topic, setTopic] = useState('')
  const [marks, setMarks] = useState({})

  const save = () => create.mutate({
    sectionId: section.id,
    date,
    ...(scheduleId ? { scheduleId: Number(scheduleId) } : {}),
    topic: topic || undefined,
    records: students.map((s) => ({ studentId: s.studentId, status: marks[s.studentId] ?? 'present' })),
  }, {
    onSuccess: (session) => {
      toast.success('Attendance saved', { description: `${formatDate(session.date)} · ${students.length} students` })
      setMarks({})
      setTopic('')
    },
    onError: (err) => {
      if (err.status === 409 && err.details?.sessionId) {
        toast.info('Attendance for this class is already recorded. Opening it for editing.')
        onExisting(err.details.sessionId)
      } else toast.error(err.message)
    },
  })

  return (
    <Card>
      <CardHeader title="Take attendance" subtitle="Everyone starts as present — mark only the exceptions." icon={UserCheck} />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Date" type="date" value={date} max={today().date} onChange={(e) => setDate(e.target.value)} />
          <Select label="Class" value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}>
            <option value="">Not tied to a timetable slot</option>
            {(section.schedules ?? []).map((s) => (
              <option key={s.id} value={s.id}>{DAY_NAMES[s.day]} {formatTime(s.startTime)}{s.room ? ` · ${s.room}` : ''}</option>
            ))}
          </Select>
          <Input label="Topic (optional)" value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Linked lists" />
        </div>
        {students.length
          ? <RosterMarker students={students} marks={marks} setMarks={setMarks} idPrefix="new" />
          : <EmptyState compact title="No students registered yet" />}
      </div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3">
        <Button loading={create.isPending} disabled={!students.length || !date} onClick={save}>Save attendance</Button>
      </div>
    </Card>
  )
}

function EditSession({ sessionId, onClose }) {
  const session = useAttendanceSession(sessionId)
  const update = useUpdateAttendance()
  const [marks, setMarks] = useState(null)
  const current = marks ?? Object.fromEntries((session.data?.students ?? []).map((s) => [s.studentId, s.status ?? 'present']))
  const save = () => update.mutate({
    sessionId,
    records: Object.entries(current).map(([studentId, status]) => ({ studentId: Number(studentId), status })),
  }, {
    onSuccess: () => { toast.success('Attendance updated'); onClose() },
    onError: (err) => toast.error(err.message),
  })
  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={session.data ? `Attendance · ${formatDate(session.data.date)}` : 'Attendance'}
      description={session.data?.topic}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={update.isPending} disabled={!session.data} onClick={save}>Save changes</Button>
        </>
      )}
    >
      {session.isPending ? <SkeletonList rows={4} /> : session.isError ? <ErrorState error={session.error} /> : (
        <RosterMarker students={session.data.students} marks={current} setMarks={(fn) => setMarks(typeof fn === 'function' ? fn(current) : fn)} idPrefix={`edit-${sessionId}`} />
      )}
    </Modal>
  )
}

export function AttendancePanel({ section, initialSlot }) {
  const data = useSectionAttendance(section.id)
  const remove = useDeleteAttendance()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)

  if (data.isPending) return <Card><SkeletonTable rows={5} /></Card>
  if (data.isError) return <Card><ErrorState title="Unable to load attendance" error={data.error} onRetry={() => data.refetch()} /></Card>
  const { sessions, students } = data.data

  return (
    <div className="space-y-6">
      <TakeAttendance key={section.id} section={section} students={students} initialSlot={initialSlot} onExisting={setEditing} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Class history" subtitle={`${sessions.length} class${sessions.length === 1 ? '' : 'es'} recorded`} icon={CalendarCheck} />
          {sessions.length ? (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{formatDate(s.date)}{s.topic && <span className="font-normal text-slate-500"> · {s.topic}</span>}</p>
                    <p className="text-xs text-slate-500">{s.counts.present} present · {s.counts.late} late · {s.counts.absent} absent · {s.counts.excused} excused</p>
                  </div>
                  <span className="w-12 text-right text-sm font-semibold tabular-nums">{s.rate ?? '—'}{s.rate !== null && '%'}</span>
                  <Button size="sm" variant="ghost" aria-label={`Edit attendance for ${formatDate(s.date)}`} onClick={() => setEditing(s.id)}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-600" aria-label={`Delete attendance for ${formatDate(s.date)}`} onClick={() => setDeleting(s)}><Trash2 className="size-4" /></Button>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="No classes recorded yet" icon={CalendarCheck} />}
        </Card>

        <Card>
          <CardHeader title="Attendance by student" subtitle="Present or late counts as attended" />
          {students.length && sessions.length ? (
            <ul className="divide-y divide-slate-100">
              {[...students].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101)).map((s) => (
                <li key={s.studentId} className="px-5 py-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{s.name} <span className="font-normal text-slate-500">· {s.studentNumber}</span></span>
                    <span className="flex items-center gap-2">
                      {s.rate !== null && s.rate < 75 && <StatusBadge status="late" tone="amber" label="Low" />}
                      <span className="w-12 text-right font-semibold tabular-nums">{s.rate ?? '—'}{s.rate !== null && '%'}</span>
                    </span>
                  </div>
                  <ProgressBar value={s.rate ?? 0} max={100} size="sm" tone={s.rate !== null && s.rate < 75 ? 'amber' : 'green'} label={`${s.name} attendance`} />
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title={students.length ? 'Rates appear after the first class is recorded' : 'No students registered yet'} />}
        </Card>
      </div>

      {editing && <EditSession sessionId={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete this attendance record?"
        confirmLabel="Delete"
        onConfirm={async () => { await remove.mutateAsync(deleting.id); toast.success('Attendance deleted') }}
      >
        <p>The record for {deleting && formatDate(deleting.date)} and every student’s mark in it will be removed.</p>
      </ConfirmDialog>
    </div>
  )
}
