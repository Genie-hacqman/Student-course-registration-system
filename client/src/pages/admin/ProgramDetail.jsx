import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { Controller } from 'react-hook-form'
import { toast } from 'sonner'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Badge, Button, Card, CardHeader, ErrorState, Input, Loading, SearchInput, Select, Tabs } from '../../components/ui'
import StudentTable from '../../components/directory/StudentTable'
import OrgStatusBadge from '../../components/directory/OrgStatusBadge'
import { can, PERMS } from '../../lib/roles'
import DataTable from '../../components/admin/DataTable'
import FormModal from '../../components/admin/FormModal'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { CoursePicker } from '../../components/admin/Pickers'
import { optionalNumber, requiredNumber } from '../../lib/forms'
import { ProgramForm, ProgramStatusDialog } from './Programs'

const addSchema = z.object({
  courseId: requiredNumber(z.number().int().positive('Choose a course'), 'Choose a course'),
  type: z.enum(['core', 'elective']),
  recommendedLevel: optionalNumber(z.number().int().min(100).max(900)),
})

/** The programme's students, by level: level tabs with counts from the server, then the student list. */
function StudentsByLevel({ program }) {
  const [params, setParams] = useSearchParams()
  const level = params.get('level') ?? ''
  const search = params.get('search') ?? ''
  const page = Number(params.get('page') ?? 1)
  const overview = useApi(`/departments/${program.departmentId}/overview`)
  const levels = overview.data?.programs.find((p) => p.id === program.id)?.levels ?? []
  const total = levels.reduce((sum, l) => sum + l.students, 0)
  const students = useApi(`/programs/${program.id}/students`, { level: level || undefined, search: search || undefined, page, limit: 20, sort: 'name' })
  const set = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }
  const tabs = [{ value: '', label: 'All levels', count: overview.data ? total : undefined }, ...levels.map((l) => ({ value: String(l.level), label: `Level ${l.level}`, count: l.students }))]
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <Tabs items={tabs} value={level} onChange={(v) => set({ level: v })} label="Level" />
        <SearchInput key={search} defaultValue={search} onSearch={(v) => set({ search: v })} placeholder="Name, Student ID or email" className="w-full sm:w-64" />
      </div>
      <StudentTable query={students} showProgram={false} showDepartment={false} onPage={(n) => set({ page: n })} empty="No students on this programme match" />
    </>
  )
}

export default function ProgramDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const canManage = can(user, PERMS.COURSE_MANAGE)
  const canEditCurriculum = can(user, PERMS.COURSE_CATALOG)
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'curriculum' ? 'curriculum' : 'students'
  const program = useApi(`/programs/${id}`)
  const curriculum = useApi(`/programs/${id}/courses`)
  const [editing, setEditing] = useState(null)
  const [changing, setChanging] = useState(null)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)

  const add = useApiMutation((body) => http.post(`/programs/${id}/courses`, body), { success: 'Course added to the curriculum' })
  const remove = useApiMutation((courseId) => http.delete(`/programs/${id}/courses/${courseId}`), { success: 'Course removed from the curriculum' })
  // No PATCH exists for a curriculum entry, so switching core/elective is remove + re-add.
  const retype = useApiMutation(async (c) => {
    await http.delete(`/programs/${id}/courses/${c.id}`)
    return http.post(`/programs/${id}/courses`, {
      courseId: c.id,
      type: c.entry.type === 'core' ? 'elective' : 'core',
      // Keep the rest of the entry (level, term, effective year) as it was.
      ...(c.entry.recommendedLevel ? { recommendedLevel: c.entry.recommendedLevel } : {}),
      ...(c.entry.semester ? { semester: c.entry.semester } : {}),
      ...(c.entry.academicYearId ? { academicYearId: c.entry.academicYearId } : {}),
    })
  }, { success: (_d, c) => `${c.code} is now ${c.entry.type === 'core' ? 'an elective' : 'a core course'}` })

  if (program.isPending) return <Loading />
  if (program.isError) return <ErrorState error={program.error} onRetry={() => program.refetch()} />
  const p = program.data
  const rows = (curriculum.data ?? []).map((c) => ({ ...c, entry: c.ProgramCourse ?? {} }))

  return (
    <div className="space-y-6">
      <Link to="/staff/programs" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="size-4" /> Programmes
      </Link>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <p className="text-sm font-semibold text-brand-700">{p.code}{p.qualificationCode ? ` · ${p.qualificationCode}` : ''}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <Link to={`/staff/departments/${p.department?.id}`} className="hover:text-brand-700">{p.department?.name}</Link> · {p.durationYears} years · up to {p.maxCredits} credits per semester
          </p>
          <div className="mt-2"><OrgStatusBadge status={p.status} /></div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(p)}><Pencil className="size-4" /> Edit</Button>
            <Button variant="secondary" onClick={() => setChanging(p)}>
              {p.status === 'archived' ? <><ArchiveRestore className="size-4" /> Activate</> : <><Archive className="size-4" /> Archive</>}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-4 pt-2">
          <Tabs
            variant="underline"
            label="Programme sections"
            items={[{ value: 'students', label: 'Students by level' }, { value: 'curriculum', label: `Curriculum (${rows.length})` }]}
            value={tab}
            onChange={(v) => setParams(v === 'students' ? {} : { tab: v }, { replace: true })}
          />
        </div>
        {tab === 'students' && <StudentsByLevel program={p} />}
        {tab === 'curriculum' && (
        <>
        <CardHeader
          title={`Curriculum (${rows.length})`}
          subtitle="Students in this programme can only register for these courses."
          action={canEditCurriculum && <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" /> Add course</Button>}
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
            { key: 'semester', header: 'Semester', render: (c) => c.entry.semester ?? 'Any' },
            { key: 'type', header: 'Type', render: (c) => <Badge tone={c.entry.type === 'core' ? 'blue' : 'slate'}>{c.entry.type}</Badge> },
            {
              key: 'actions', header: '', className: 'text-right', render: (c) => canEditCurriculum && (
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
        </>
        )}
      </Card>

      {canManage && <ProgramForm editing={editing} onClose={() => setEditing(null)} />}
      {canManage && <ProgramStatusDialog program={changing} onClose={() => setChanging(null)} />}

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
