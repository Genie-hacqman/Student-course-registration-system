import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, CalendarDays, MailPlus, Pencil, Plus, Power, UserPlus } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, ErrorState, Loading, Modal } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Checkbox } from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { DAY_NAMES, DAY_ORDER, formatDate, formatTime, fullName } from '../../lib/format'
import { can, PERMS } from '../../lib/roles'
import { LecturerFields, lecturerSchema, lecturerStatus } from './Lecturers'

const editSchema = lecturerSchema.omit({ schoolEmail: true })

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children || '—'}</dd>
    </div>
  )
}

function TeachingSchedule({ sections }) {
  const slots = sections
    .flatMap((section) => (section.schedules ?? []).map((s) => ({ ...s, course: section.course, sectionCode: section.sectionCode })))
    .sort((x, y) => DAY_ORDER.indexOf(x.day) - DAY_ORDER.indexOf(y.day) || x.startTime.localeCompare(y.startTime))
  return (
    <Card>
      <CardHeader
        title="Teaching schedule"
        subtitle={sections.length ? `${sections.length} ${sections.length === 1 ? 'offering' : 'offerings'} this term: ${sections.map((s) => s.course?.code).join(', ')}` : 'Class times this term.'}
        icon={CalendarDays}
      />
      <DataTable
        rows={slots}
        empty={sections.length ? 'No class times set yet' : 'Not teaching anything this term'}
        emptyHint={sections.length ? 'Class times appear here once their offerings have a timetable.' : undefined}
        columns={[
          { key: 'day', header: 'Day', render: (s) => <span className="font-medium">{DAY_NAMES[s.day]}</span> },
          { key: 'time', header: 'Time', render: (s) => `${formatTime(s.startTime)} – ${formatTime(s.endTime)}` },
          { key: 'course', header: 'Course', render: (s) => `${s.course?.code} · Section ${s.sectionCode}` },
          { key: 'room', header: 'Room', render: (s) => s.room || '—' },
        ]}
      />
    </Card>
  )
}

const departmentsSchema = z.object({ departmentIds: z.array(z.coerce.number().int().positive()) })

function ManageDepartments({ open, onClose, lecturer, departments }) {
  const save = useApiMutation((departmentIds) => http.put(`/lecturers/${lecturer.id}/departments`, { departmentIds }), { success: 'Departments updated' })
  const current = lecturer.additionalDepartments?.map((d) => d.id) ?? []
  const choices = (departments ?? []).filter((d) => d.id !== lecturer.departmentId && (d.status !== 'archived' || current.includes(d.id)))
  return (
    <FormModal
      open={open}
      onClose={onClose}
      title="Additional departments"
      schema={departmentsSchema}
      defaultValues={{ departmentIds: current.map(String) }}
      onSubmit={(v) => save.mutateAsync(v.departmentIds.map(Number))}
      submitLabel="Save departments"
    >
      {({ register }) => (
        <>
          <p className="text-sm text-slate-600">Home department: <span className="font-medium">{lecturer.department?.name}</span>. Choose any other departments they also teach for.</p>
          {choices.length === 0 ? <p className="text-sm text-slate-500">There are no other open departments.</p> : (
            <div className="space-y-2">
              {choices.map((d) => <Checkbox key={d.id} value={String(d.id)} label={`${d.name} (${d.code})${d.status === 'archived' ? ' · archived' : ''}`} {...register('departmentIds')} />)}
            </div>
          )}
        </>
      )}
    </FormModal>
  )
}

function AssignToOffering({ open, onClose, lecturer }) {
  const current = useApi(open ? '/semesters/current' : null)
  const sections = useApi(open && current.data ? '/sections' : null, { semesterId: current.data?.id, unassigned: true, limit: 100 })
  const assign = useApiMutation((sectionId) => http.put(`/sections/${sectionId}/lecturer`, { lecturerId: lecturer.id }), {
    success: (r) => `Assigned to ${r?.section?.course?.code ?? 'the offering'}`,
  })
  const mine = new Set([lecturer.departmentId, ...(lecturer.additionalDepartments ?? []).map((d) => d.id)])
  const rows = (sections.data?.items ?? []).filter((s) => s.status !== 'cancelled' && mine.has(s.course?.departmentId))
  return (
    <Modal open={open} onClose={onClose} wide title="Assign to a course offering" description={current.data ? `${current.data.name}: open offerings in their departments without a lecturer` : undefined}>
      {current.isPending || sections.isPending ? <Loading /> : !current.data ? <EmptyState title="There is no current semester" /> : (
        <DataTable
          rows={rows}
          empty="Nothing to assign"
          emptyHint="Every offering in their departments this term already has a lecturer."
          columns={[
            { key: 'course', header: 'Course', render: (s) => <div className="leading-tight"><p className="font-medium">{s.course?.code} · Section {s.sectionCode}</p><p className="text-xs text-slate-500">{s.course?.title}</p></div> },
            { key: 'seats', header: 'Enrolled', render: (s) => `${s.seatsTaken} / ${s.capacity}` },
            {
              key: 'action', header: '', className: 'text-right', render: (s) => (
                <Button size="sm" loading={assign.isPending && assign.variables === s.id} onClick={() => assign.mutate(s.id, { onSuccess: onClose })}>
                  <Plus className="size-4" /> Assign
                </Button>
              ),
            },
          ]}
        />
      )}
    </Modal>
  )
}

export default function LecturerDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const canManage = can(user, PERMS.USER_MANAGE)
  const canAssign = can(user, PERMS.LECTURER_ASSIGN)
  const lecturer = useApi(`/lecturers/${id}`)
  const departments = useApi('/departments')
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [managingDepartments, setManagingDepartments] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const save = useApiMutation((body) => http.patch(`/lecturers/${id}`, body), { success: 'Lecturer updated' })
  const setActive = useApiMutation((active) => http.post(`/lecturers/${id}/${active ? 'activate' : 'deactivate'}`), {
    success: (_d, active) => (active ? 'Lecturer activated' : 'Lecturer deactivated — their sessions have ended'),
  })
  const invite = useApiMutation(() => http.post(`/lecturers/${id}/invite`), { success: 'Activation link sent again' })

  if (lecturer.isPending) return <Loading />
  if (lecturer.isError) return <ErrorState error={lecturer.error} onRetry={() => lecturer.refetch()} />
  const l = lecturer.data
  const st = lecturerStatus(l)
  const active = l.user?.status === 'active'
  const assignments = l.assignments ?? []

  return (
    <div className="space-y-6">
      <Link to="/staff/lecturers" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Lecturers
      </Link>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <Avatar user={l.user} size="xl" />
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{[l.title, fullName(l.user)].filter(Boolean).join(' ')}</h1>
              <p className="mt-0.5 text-sm text-slate-500">{l.staffNumber} · {l.department?.name}</p>
              <div className="mt-2"><Badge tone={st.tone}>{st.label}</Badge></div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {canAssign && active && <Button onClick={() => setAssigning(true)}><UserPlus className="size-4" /> Assign to offering</Button>}
            {canManage && active && Number(l.invitePending) === 1 && (
              <Button variant="secondary" loading={invite.isPending} onClick={() => invite.mutate()}><MailPlus className="size-4" /> Resend activation</Button>
            )}
            {canManage && <Button variant="secondary" onClick={() => setToggling(true)}><Power className="size-4" /> {active ? 'Deactivate' : 'Activate'}</Button>}
            {canManage && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>}
          </div>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-3">
          <Field label="School email">{l.user?.email}</Field>
          <Field label="Personal email">{l.personalEmail}</Field>
          <Field label="Phone">{l.phone}</Field>
          <Field label="Home department"><Link to={`/staff/departments/${l.department?.id}`} className="hover:text-brand-700">{l.department?.name}</Link></Field>
          <Field label="Specialization">{l.specialization}</Field>
          <Field label="Current offerings">{String(Number(l.currentSections ?? 0))}</Field>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Departments"
          subtitle="Their home department, and any others they also teach for."
          icon={Building2}
          action={canManage && <Button size="sm" variant="secondary" onClick={() => setManagingDepartments(true)}><Pencil className="size-4" /> Manage</Button>}
        />
        <div className="flex flex-wrap gap-2 px-5 py-4">
          <Link to={`/staff/departments/${l.department?.id}`}><Badge tone="blue">{l.department?.name} · home</Badge></Link>
          {l.additionalDepartments?.map((d) => <Link key={d.id} to={`/staff/departments/${d.id}`}><Badge tone="slate">{d.name}{d.status === 'archived' ? ' (archived)' : ''}</Badge></Link>)}
          {!l.additionalDepartments?.length && <span className="text-sm text-slate-500">No additional departments.</span>}
        </div>
      </Card>

      <TeachingSchedule sections={l.currentTeaching ?? []} />

      <Card>
        <CardHeader title="Assignment history" subtitle="Assignments made by the registry, current first." />
        <DataTable
          rows={assignments}
          empty={l.currentTeaching?.length
            ? 'No assignments recorded by the registry. Their current offerings were set up directly, for example by an import.'
            : 'Not assigned to any course yet'}
          columns={[
            {
              key: 'course', header: 'Course', render: (a) => (
                <div className="leading-tight">
                  <p className="font-medium">{a.section?.course?.code} · Section {a.section?.sectionCode}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{a.section?.course?.title}</p>
                </div>
              ),
            },
            { key: 'term', header: 'Semester', render: (a) => `${a.section?.semester?.name ?? '—'} · ${a.section?.semester?.academicYear?.name ?? ''}` },
            { key: 'students', header: 'Enrolled', render: (a) => `${a.section?.seatsTaken ?? 0} / ${a.section?.capacity ?? 0}` },
            { key: 'when', header: 'Period', render: (a) => `${formatDate(a.assignedAt)} – ${a.endedAt ? formatDate(a.endedAt) : 'now'}` },
            { key: 'status', header: 'Status', render: (a) => <Badge tone={a.status === 'active' ? 'green' : 'slate'}>{a.status === 'active' ? 'Current' : 'Ended'}</Badge> },
          ]}
        />
      </Card>

      <FormModal
        open={editing}
        onClose={() => setEditing(false)}
        wide
        title={`Edit ${fullName(l.user)}`}
        schema={editSchema}
        defaultValues={{
          title: l.title ?? '', firstName: l.user?.firstName ?? '', lastName: l.user?.lastName ?? '', staffNumber: l.staffNumber,
          departmentId: l.departmentId, personalEmail: l.personalEmail ?? '', phone: l.phone ?? '', specialization: l.specialization ?? '',
        }}
        onSubmit={(v) => save.mutateAsync({ ...v, personalEmail: v.personalEmail ?? null, phone: v.phone ?? null })}
      >
        {({ register, formState: { errors } }) => (
          <LecturerFields register={register} errors={errors} departments={departments.data?.filter((d) => d.status !== 'archived' || d.id === l.departmentId)} />
        )}
      </FormModal>
      {canManage && <ManageDepartments open={managingDepartments} onClose={() => setManagingDepartments(false)} lecturer={l} departments={departments.data} />}
      {canAssign && <AssignToOffering open={assigning} onClose={() => setAssigning(false)} lecturer={l} />}

      <ConfirmDialog
        open={toggling}
        onClose={() => setToggling(false)}
        title={active ? `Deactivate ${fullName(l.user)}?` : `Activate ${fullName(l.user)}?`}
        confirmLabel={active ? 'Deactivate' : 'Activate'}
        danger={active}
        onConfirm={() => setActive.mutateAsync(!active)}
      >
        <p>
          {active
            ? 'They are signed out everywhere and can’t sign in. Their course assignments stay in place; ask the registry to reassign them if needed. Inactive lecturers can’t be given new assignments.'
            : 'They can sign in again and be assigned to courses.'}
        </p>
      </ConfirmDialog>
    </div>
  )
}
