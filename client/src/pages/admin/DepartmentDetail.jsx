import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowLeft, BookOpen, GraduationCap, Library, Pencil, Presentation } from 'lucide-react'
import { useApi } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar, Badge, Button, Card, ErrorState, Loading, QueryState, SearchInput, Select, Tabs } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { StatCard, StatGrid } from '../../components/dashboard/StatCard'
import StudentTable from '../../components/directory/StudentTable'
import OrgStatusBadge from '../../components/directory/OrgStatusBadge'
import { DepartmentForm, DepartmentStatusDialog } from './Departments'
import { lecturerStatus } from './Lecturers'
import { fullName } from '../../lib/format'
import { can, PERMS } from '../../lib/roles'

const TABS = [
  { value: 'students', label: 'Students' },
  { value: 'lecturers', label: 'Lecturers' },
  { value: 'programs', label: 'Programmes' },
  { value: 'courses', label: 'Courses' },
]

/** Students of this department (through its programmes), narrowed by programme, level and search. */
function StudentsTab({ departmentId, programs, params, set }) {
  const programId = params.get('program') ?? ''
  const level = params.get('level') ?? ''
  const search = params.get('search') ?? ''
  const program = programs.find((p) => String(p.id) === programId)
  const students = useApi(`/departments/${departmentId}/students`, {
    programId: programId || undefined, level: level || undefined, search: search || undefined,
    page: Number(params.get('page') ?? 1), limit: 20, sort: 'name',
  })
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
        <SearchInput key={search} defaultValue={search} onSearch={(v) => set({ search: v })} placeholder="Name, Student ID or email" className="w-full sm:w-64" />
        <Select aria-label="Programme" className="w-full sm:w-56" value={programId} onChange={(e) => set({ program: e.target.value, level: '' })}>
          <option value="">All programmes</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.students} students</option>)}
        </Select>
        <Select aria-label="Level" className="w-full sm:w-40" value={level} onChange={(e) => set({ level: e.target.value })} disabled={!program}>
          <option value="">{program ? 'All levels' : 'Level'}</option>
          {program?.levels.map((l) => <option key={l.level} value={l.level}>Level {l.level} · {l.students}</option>)}
        </Select>
      </div>
      <StudentTable query={students} showDepartment={false} onPage={(n) => set({ page: n })} empty="No students in this department match" />
    </>
  )
}

/** Lecturers whose home department this is, and those who also teach here. */
function LecturersTab({ departmentId, params, set }) {
  const navigate = useNavigate()
  const search = params.get('search') ?? ''
  const lecturers = useApi(`/departments/${departmentId}/lecturers`, { search: search || undefined, page: Number(params.get('page') ?? 1), limit: 20 })
  return (
    <>
      <div className="border-b border-slate-100 p-4">
        <SearchInput key={search} defaultValue={search} onSearch={(v) => set({ search: v })} placeholder="Name, staff ID or email" className="w-full sm:w-64" />
      </div>
      <QueryState query={lecturers} loadingLabel="Loading lecturers…">
        {({ items, meta }) => (
          <DataTable
            rows={items}
            meta={meta}
            onPage={(n) => set({ page: n })}
            empty="No lecturers in this department"
            onRowClick={(l) => navigate(`/staff/lecturers/${l.id}`)}
            columns={[
              {
                key: 'name', header: 'Lecturer', render: (l) => (
                  <div className="flex items-center gap-3">
                    <Avatar user={l.user} thumb size="md" />
                    <div className="leading-tight">
                      <p className="font-medium">{[l.title, fullName(l.user)].filter(Boolean).join(' ')}</p>
                      <p className="text-xs text-slate-500">{l.user?.email}</p>
                    </div>
                  </div>
                ),
              },
              { key: 'staffNumber', header: 'Staff ID', render: (l) => <span className="tabular-nums">{l.staffNumber}</span> },
              { key: 'membership', header: 'In this department', render: (l) => (l.membership === 'home' ? <Badge tone="blue">Home department</Badge> : <Badge tone="slate">Additional</Badge>) },
              { key: 'specialization', header: 'Specialisation', render: (l) => l.specialization || '—' },
              { key: 'offerings', header: 'Offerings', render: (l) => <span className="tabular-nums">{l.currentSections}</span> },
              { key: 'status', header: 'Status', render: (l) => { const s = lecturerStatus(l); return <Badge tone={s.tone}>{s.label}</Badge> } },
            ]}
          />
        )}
      </QueryState>
    </>
  )
}

function ProgramsTab({ programs }) {
  const navigate = useNavigate()
  return (
    <DataTable
      rows={programs}
      empty="No programmes in this department yet"
      onRowClick={(p) => navigate(`/staff/programs/${p.id}`)}
      columns={[
        { key: 'name', header: 'Programme', render: (p) => <div className="leading-tight"><p className="font-medium">{p.name}</p><p className="text-xs text-slate-500">{p.code}</p></div> },
        { key: 'qualification', header: 'Qualification', render: (p) => p.qualificationCode || '—' },
        { key: 'duration', header: 'Duration', render: (p) => `${p.durationYears} ${p.durationYears === 1 ? 'year' : 'years'}` },
        { key: 'students', header: 'Students', render: (p) => <span className="tabular-nums">{p.students}</span> },
        {
          key: 'levels', header: 'By level', render: (p) => (p.levels.length
            ? <span className="text-xs text-slate-600">{p.levels.map((l) => `L${l.level}: ${l.students}`).join(' · ')}</span>
            : <span className="text-xs text-slate-400">—</span>),
        },
        { key: 'status', header: 'Status', render: (p) => <OrgStatusBadge status={p.status} /> },
      ]}
    />
  )
}

function CoursesTab({ departmentId, params, set }) {
  const navigate = useNavigate()
  const courses = useApi('/courses', { departmentId, page: Number(params.get('page') ?? 1), limit: 20 })
  return (
    <QueryState query={courses} loadingLabel="Loading courses…">
      {({ items, meta }) => (
        <DataTable
          rows={items}
          meta={meta}
          onPage={(n) => set({ page: n })}
          empty="No courses in this department yet"
          onRowClick={(c) => navigate(`/staff/courses/${c.id}`)}
          columns={[
            { key: 'code', header: 'Code', render: (c) => <span className="font-medium">{c.code}</span> },
            { key: 'title', header: 'Title' },
            { key: 'level', header: 'Level' },
            { key: 'credits', header: 'Credits' },
            { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'active' ? 'green' : 'slate'}>{c.status}</Badge> },
          ]}
        />
      )}
    </QueryState>
  )
}

/** One department: its counts and its students, lecturers, programmes and courses, each in a tab. */
export default function DepartmentDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const canManage = can(user, PERMS.COURSE_MANAGE)
  const [params, setParams] = useSearchParams()
  const overview = useApi(`/departments/${id}/overview`)
  const [editing, setEditing] = useState(null)
  const [changing, setChanging] = useState(null)
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'students'

  /** Tab-scoped filters live in the URL; switching tabs clears them. */
  const set = (changes) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === undefined || value === null || value === '') next.delete(key)
      else next.set(key, String(value))
    }
    if (!('page' in changes)) next.delete('page')
    setParams(next, { replace: true })
  }

  if (overview.isPending) return <Loading />
  if (overview.isError) return <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
  const d = overview.data
  const back = <Link to="/staff/departments" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"><ArrowLeft className="size-4" /> Departments</Link>

  return (
    <div className="space-y-6">
      {back}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{d.code}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{d.name}</h1>
            <div className="mt-2"><OrgStatusBadge status={d.status} /></div>
            {d.status === 'archived' && <p className="mt-2 max-w-xl text-sm text-slate-600">Archived: closed to new programmes, courses, lecturers and admissions. Everything below stays as it was.</p>}
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(d)}><Pencil className="size-4" /> Edit</Button>
              <Button variant="secondary" onClick={() => setChanging(d)}>
                {d.status === 'archived' ? <><ArchiveRestore className="size-4" /> Activate</> : <><Archive className="size-4" /> Archive</>}
              </Button>
            </div>
          )}
        </div>
        <StatGrid className="mt-6">
          <StatCard index={0} label="Students" value={d.counts.students} hint={`${d.counts.activeStudents} active`} icon={GraduationCap} />
          <StatCard index={1} label="Lecturers" value={d.counts.lecturers} hint="Home and additional" icon={Presentation} tone="violet" />
          <StatCard index={2} label="Programmes" value={d.counts.programs} hint={`${d.counts.activePrograms} active`} icon={Library} tone="green" />
          <StatCard index={3} label="Courses" value={d.counts.courses} icon={BookOpen} tone="amber" />
        </StatGrid>
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-4 pt-2">
          <Tabs variant="underline" items={TABS} value={tab} onChange={(v) => setParams(v === 'students' ? {} : { tab: v }, { replace: true })} label="Department sections" />
        </div>
        {tab === 'students' && <StudentsTab departmentId={id} programs={d.programs} params={params} set={set} />}
        {tab === 'lecturers' && <LecturersTab departmentId={id} params={params} set={set} />}
        {tab === 'programs' && <ProgramsTab programs={d.programs} />}
        {tab === 'courses' && <CoursesTab departmentId={id} params={params} set={set} />}
      </Card>

      {canManage && (
        <>
          <DepartmentForm editing={editing} onClose={() => setEditing(null)} />
          <DepartmentStatusDialog department={changing} onClose={() => setChanging(null)} />
        </>
      )}
    </div>
  )
}
