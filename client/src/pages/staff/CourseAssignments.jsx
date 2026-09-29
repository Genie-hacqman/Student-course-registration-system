import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { History, Plus, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import {
  Badge, Button, Card, EmptyState, Loading, Modal, PageHeader, QueryState, Select,
} from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { Checkbox } from '../../components/admin/FormModal'
import ClashList, { isClash } from '../../components/admin/ClashList'
import { SemesterSelect, useSemesterParam } from '../../components/staff'
import { formatDateTime, fullName, lecturerName } from '../../lib/format'

const inactive = (lecturer) => lecturer && lecturer.user?.status && lecturer.user.status !== 'active'

/**
 * Registry: who teaches each course offering (course_sections) of a semester. Assigning goes through
 * PUT /sections/:id/lecturer, which checks the lecturer is active, in the course's department (when the
 * institution restricts it), free at the offering's class times, and not already assigned.
 */
export default function CourseAssignments() {
  const [params, setParams] = useSearchParams()
  const { semesterId, setSemesterId, semesters, semester } = useSemesterParam()
  const departments = useApi('/departments')
  const department = params.get('department') ?? ''
  const unassigned = params.get('unassigned') === 'true'
  const page = Number(params.get('page') ?? 1)
  const offerings = useApi(semesterId ? '/sections' : null, {
    semesterId, departmentId: department || undefined, unassigned: unassigned ? 'true' : undefined, page, limit: 25,
  })
  const [assigning, setAssigning] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [historyOf, setHistoryOf] = useState(null)

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }
  const departmentCode = (id) => departments.data?.find((d) => d.id === id)?.code

  return (
    <div>
      <PageHeader
        title="Course assignments"
        subtitle="Assign lecturers to course offerings. The same course can have a different lecturer in each semester or section."
        action={<Link to="/staff/sections"><Button variant="secondary"><Plus className="size-4" /> Create offering</Button></Link>}
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
        <SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />
        <Select value={department} onChange={(e) => set('department', e.target.value)} aria-label="Department" className="w-full sm:w-56">
          <option value="">All departments</option>
          {departments.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Checkbox label="Unassigned only" checked={unassigned} onChange={(e) => set('unassigned', e.target.checked ? 'true' : '')} />
      </Card>
      <Card>
        {!semesterId ? <Loading /> : (
          <QueryState query={offerings}>
            {({ items, meta }) => (
              <DataTable
                rows={items}
                meta={meta}
                onPage={(n) => set('page', String(n))}
                empty={unassigned ? 'Every offering has a lecturer' : `No offerings in ${semester?.name ?? 'this semester'}`}
                emptyHint={<Link to="/staff/sections" className="text-brand-700 hover:underline">Create course offerings on the Sections page.</Link>}
                columns={[
                  {
                    key: 'course', header: 'Course', render: (s) => (
                      <div className="leading-tight">
                        <p className="font-medium">{s.course.code} · Section {s.sectionCode}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{s.course.title}</p>
                      </div>
                    ),
                  },
                  { key: 'dept', header: 'Department', render: (s) => departmentCode(s.course.departmentId) ?? '—' },
                  { key: 'term', header: 'Semester', render: (s) => `${s.semester?.name ?? ''} · ${s.semester?.academicYear?.name ?? ''}` },
                  {
                    key: 'lecturer', header: 'Lecturer', render: (s) => (s.lecturer ? (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {lecturerName(s.lecturer)}
                        {inactive(s.lecturer) && <Badge tone="red">inactive</Badge>}
                      </span>
                    ) : <Badge tone="amber">Unassigned</Badge>),
                  },
                  { key: 'enrolled', header: 'Enrolled', render: (s) => `${s.seatsTaken} / ${s.capacity}` },
                  {
                    key: 'actions', header: '', className: 'text-right whitespace-nowrap', render: (s) => (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setHistoryOf(s)} aria-label={`History of ${s.course.code}`}><History className="size-4" /></Button>
                        {s.lecturer && s.status !== 'cancelled' && (
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setRemoving(s)}><UserMinus className="size-4" /> Remove</Button>
                        )}
                        {s.status !== 'cancelled' && (
                          <Button size="sm" onClick={() => setAssigning(s)}><UserPlus className="size-4" /> {s.lecturer ? 'Change' : 'Assign'}</Button>
                        )}
                      </div>
                    ),
                  },
                ]}
              />
            )}
          </QueryState>
        )}
      </Card>

      {assigning && <AssignDialog offering={assigning} departments={departments.data} onClose={() => setAssigning(null)} />}
      {removing && <RemoveDialog offering={removing} onClose={() => setRemoving(null)} />}
      {historyOf && <HistoryDialog offering={historyOf} onClose={() => setHistoryOf(null)} />}
    </div>
  )
}

function AssignDialog({ offering, departments, onClose }) {
  const [allDepartments, setAllDepartments] = useState(false)
  const [lecturerId, setLecturerId] = useState('')
  const [reason, setReason] = useState('')
  const [clash, setClash] = useState(null)
  const [problem, setProblem] = useState(null)
  const lecturers = useApi('/lecturers', {
    status: 'active', limit: 100, sort: 'staffNumber', ...(allDepartments ? {} : { departmentId: offering.course.departmentId }),
  })
  const assign = useApiMutation((body) => http.put(`/sections/${offering.id}/lecturer`, body))
  const deptName = departments?.find((d) => d.id === offering.course.departmentId)?.name

  const submit = () => {
    setClash(null)
    setProblem(null)
    assign.mutate({ lecturerId: Number(lecturerId), ...(reason.trim() ? { reason: reason.trim() } : {}) }, {
      onSuccess: () => {
        toast.success(`Lecturer ${offering.lecturer ? 'changed' : 'assigned'} for ${offering.course.code} section ${offering.sectionCode}`)
        onClose()
      },
      onError: (err) => (isClash(err) ? setClash(err) : setProblem(err.message)),
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${offering.lecturer ? 'Change' : 'Assign'} lecturer · ${offering.course.code} section ${offering.sectionCode}`}
      description={`${offering.course.title} · ${offering.semester?.name ?? ''} ${offering.semester?.academicYear?.name ?? ''}`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!lecturerId} loading={assign.isPending} onClick={submit}>Assign lecturer</Button>
        </>
      )}
    >
      <div className="space-y-4">
        {offering.lecturer && <p className="text-sm text-slate-600">Currently: <span className="font-medium">{lecturerName(offering.lecturer)}</span></p>}
        <Select label="Lecturer" value={lecturerId} onChange={(e) => setLecturerId(e.target.value)} disabled={lecturers.isPending}>
          <option value="">{lecturers.isPending ? 'Loading…' : 'Choose a lecturer'}</option>
          {lecturers.data?.items.filter((l) => l.id !== offering.lecturerId).map((l) => (
            <option key={l.id} value={l.id}>{lecturerName(l)} · {l.department?.code} · {l.staffNumber} · {Number(l.currentSections ?? 0)} offerings</option>
          ))}
        </Select>
        <Checkbox
          label="Show lecturers from all departments"
          hint={`Listed: active lecturers${allDepartments ? '' : ` in ${deptName ?? 'the course’s department'}`}. The server still applies the institution’s department rule.`}
          checked={allDepartments}
          onChange={(e) => { setAllDepartments(e.target.checked); setLecturerId('') }}
        />
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Reason (optional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={255}
            className="block w-full rounded-lg border-0 px-3 py-2 text-sm shadow-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
            placeholder={offering.lecturer ? 'e.g. Staff change' : ''}
          />
        </label>
        {clash && <ClashList error={clash} />}
        {problem && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{problem}</p>}
      </div>
    </Modal>
  )
}

function RemoveDialog({ offering, onClose }) {
  const [reason, setReason] = useState('')
  const remove = useApiMutation((body) => http.delete(`/sections/${offering.id}/lecturer`, body), { success: 'Assignment removed' })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Remove ${lecturerName(offering.lecturer)} from ${offering.course.code} section ${offering.sectionCode}?`}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={remove.isPending}
            onClick={() => remove.mutate(reason.trim() ? { reason: reason.trim() } : {}, { onSuccess: onClose, onError: (err) => toast.error(err.message) })}
          >
            Remove assignment
          </Button>
        </>
      )}
    >
      <p className="mb-3 text-sm text-slate-600">The offering stays open without a lecturer, and the lecturer is notified. The assignment remains in its history.</p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={255}
        placeholder="Reason (optional)"
        className="block w-full rounded-lg border-0 px-3 py-2 text-sm shadow-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
      />
    </Modal>
  )
}

function HistoryDialog({ offering, onClose }) {
  const history = useApi(`/sections/${offering.id}/lecturer-history`)
  return (
    <Modal open onClose={onClose} wide title={`Assignment history · ${offering.course.code} section ${offering.sectionCode}`} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <QueryState query={history}>
        {({ assignments }) => (assignments.length ? (
          <ol className="space-y-3">
            {assignments.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{lecturerName(a.lecturer)} <span className="text-slate-500">· {a.lecturer?.staffNumber}</span></span>
                  <Badge tone={a.status === 'active' ? 'green' : 'slate'}>{a.status === 'active' ? 'Current' : 'Ended'}</Badge>
                </div>
                <p className="mt-1 text-slate-600">Assigned {formatDateTime(a.assignedAt)}{a.assigner ? ` by ${fullName(a.assigner)}` : ''}</p>
                {a.endedAt && (
                  <p className="text-slate-600">Ended {formatDateTime(a.endedAt)}{a.ender ? ` by ${fullName(a.ender)}` : ''}{a.endReason ? ` — ${a.endReason}` : ''}</p>
                )}
              </li>
            ))}
          </ol>
        ) : <EmptyState title="No lecturer has been assigned yet" compact />)}
      </QueryState>
    </Modal>
  )
}
