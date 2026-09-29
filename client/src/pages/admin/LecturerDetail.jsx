import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, MailPlus, Pencil, Power } from 'lucide-react'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, CardHeader, ErrorState, Loading } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { formatDate, fullName } from '../../lib/format'
import { LecturerFields, lecturerSchema, lecturerStatus } from './Lecturers'

// Editing uses the same fields minus the school email (the account's sign-in address).
const editSchema = lecturerSchema.omit({ schoolEmail: true })

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children || '—'}</dd>
    </div>
  )
}

/** Admin: one lecturer's profile, account status and the course offerings they teach or taught. */
export default function LecturerDetail() {
  const { id } = useParams()
  const lecturer = useApi(`/lecturers/${id}`)
  const departments = useApi('/departments')
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)
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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{[l.title, fullName(l.user)].filter(Boolean).join(' ')}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{l.staffNumber} · {l.department?.name}</p>
            <div className="mt-2"><Badge tone={st.tone}>{st.label}</Badge></div>
          </div>
          <div className="flex flex-wrap gap-2">
            {active && Number(l.invitePending) === 1 && (
              <Button variant="secondary" loading={invite.isPending} onClick={() => invite.mutate()}><MailPlus className="size-4" /> Resend activation</Button>
            )}
            <Button variant="secondary" onClick={() => setToggling(true)}><Power className="size-4" /> {active ? 'Deactivate' : 'Activate'}</Button>
            <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="size-4" /> Edit</Button>
          </div>
        </div>
        <dl className="mt-6 grid gap-5 sm:grid-cols-3">
          <Field label="School email">{l.user?.email}</Field>
          <Field label="Personal email">{l.personalEmail}</Field>
          <Field label="Phone">{l.phone}</Field>
          <Field label="Department">{l.department?.name}</Field>
          <Field label="Specialization">{l.specialization}</Field>
          <Field label="Current offerings">{String(Number(l.currentSections ?? 0))}</Field>
        </dl>
      </Card>

      <Card>
        <CardHeader title="Course assignments" subtitle="Assigned by the registry. Current assignments first." />
        <DataTable
          rows={assignments}
          empty="Not assigned to any course yet"
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
        {({ register, formState: { errors } }) => <LecturerFields register={register} errors={errors} departments={departments.data} />}
      </FormModal>

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
