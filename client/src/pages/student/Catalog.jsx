import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertTriangle, BookOpen, Search } from 'lucide-react'
import { useAvailableCourses, useDepartments, useMyWaitlists } from '../../api/student'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, QueryState, Select } from '../../components/ui'
import { SectionActionButton } from '../../components/SectionCard'
import { useRegistrationActions } from '../../components/RegistrationActions'
import { useSectionRooms } from '../../lib/socket'
import { SECTION_STATUS, windowState } from '../../lib/format'
import { summarize } from '../../lib/courses'


const FILTERS = ['q', 'department', 'level', 'credits', 'availability', 'type']

function CourseCard({ course, departmentName, onAdd, onWaitlist, pendingId, waitlisted }) {
  const s = course.summary
  const status = SECTION_STATUS[s.status]
  const single = course.sections.length === 1 ? course.sections[0] : null
  const fill = s.capacity ? s.seatsTaken / s.capacity : 0
  return (
    <Card className="flex flex-col">
      <div className="flex-1 space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-brand-700">{course.code}</p>
            <h3 className="font-semibold leading-snug">{course.title}</h3>
          </div>
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-slate-500">Credits</dt><dd className="font-medium">{course.credits}</dd>
          <dt className="text-slate-500">Department</dt><dd className="font-medium">{departmentName ?? '—'}</dd>
          <dt className="text-slate-500">Level</dt><dd className="font-medium">{course.level}</dd>
          <dt className="text-slate-500">Type</dt><dd className="font-medium capitalize">{course.type}</dd>
          <dt className="text-slate-500">Lecturer</dt><dd className="truncate font-medium" title={s.lecturers.join(', ')}>{s.lecturers.join(', ')}</dd>
        </dl>
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>Capacity</span>
            <span className="font-medium text-slate-700">{s.seatsTaken} / {s.capacity}</span>
          </div>
          <ProgressBar value={s.seatsTaken} max={s.capacity} tone={fill >= 1 ? 'red' : fill >= 0.9 ? 'amber' : 'brand'} />
        </div>
        {s.reason && (
          <p className="flex gap-2 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {s.reason.message}
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
        <Link to={`/student/courses/${course.id}`}>
          <Button variant="secondary" size="sm">View details</Button>
        </Link>
        {single ? (
          <SectionActionButton section={single} onAdd={onAdd} onWaitlist={onWaitlist} pendingId={pendingId} onWaitlistIds={waitlisted} />
        ) : s.status === 'eligible' && (
          <Link to={`/student/courses/${course.id}`}><Button size="sm">Choose section</Button></Link>
        )}
      </div>
    </Card>
  )
}

export default function Catalog() {
  const available = useAvailableCourses()
  const departments = useDepartments()
  const waitlists = useMyWaitlists()
  const { addSection, joinWaitlist, pendingId, dialog } = useRegistrationActions()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const f = Object.fromEntries(FILTERS.map((k) => [k, params.get(k) ?? '']))

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const deptName = useMemo(() => new Map((departments.data ?? []).map((d) => [d.id, d.name])), [departments.data])
  const waitlisted = useMemo(() => new Set((waitlists.data ?? []).map((w) => w.courseSectionId)), [waitlists.data])

  const courses = useMemo(() => (available.data?.courses ?? []).map((c) => ({ ...c, summary: summarize(c) })), [available.data])
  const options = useMemo(() => ({
    levels: [...new Set(courses.map((c) => c.level))].sort((a, b) => a - b),
    credits: [...new Set(courses.map((c) => c.credits))].sort((a, b) => a - b),
    departments: [...new Set(courses.map((c) => c.departmentId))],
  }), [courses])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return courses.filter((c) => {
      if (term) {
        const haystack = [c.code, c.title, deptName.get(c.departmentId), ...c.summary.lecturers].join(' ').toLowerCase()
        if (!haystack.includes(term)) return false
      }
      if (f.department && String(c.departmentId) !== f.department) return false
      if (f.level && String(c.level) !== f.level) return false
      if (f.credits && String(c.credits) !== f.credits) return false
      if (f.type && c.type !== f.type) return false
      if (f.availability === 'seats' && c.summary.seatsAvailable <= 0) return false
      if (f.availability === 'eligible' && c.summary.status !== 'eligible') return false
      return true
    })
  }, [courses, q, f.department, f.level, f.credits, f.type, f.availability, deptName])

  useSectionRooms(filtered.flatMap((c) => c.sections.map((s) => s.id)))

  const win = windowState(available.data?.semester)
  const active = FILTERS.some((k) => f[k]) || q

  return (
    <div>
      <PageHeader
        title="Course Catalog"
        subtitle={available.data && `${available.data.semester.name} · ${available.data.program?.name ?? ''} · ${available.data.currentCredits} / ${available.data.maxCredits} credits registered`}
        action={available.data && <Badge tone={win.tone}>Registration: {win.label}</Badge>}
      />

      <Card className="mb-6 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-slate-400" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setFilter('q', e.target.value) }}
            placeholder="Search by course code, name, department or lecturer…"
            className="block w-full rounded-lg border-0 py-2 pr-3 pl-9 text-sm ring-1 ring-slate-300 ring-inset focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Select value={f.department} onChange={(e) => setFilter('department', e.target.value)} aria-label="Department">
            <option value="">All departments</option>
            {options.departments.map((id) => <option key={id} value={id}>{deptName.get(id) ?? `Department ${id}`}</option>)}
          </Select>
          <Select value={f.level} onChange={(e) => setFilter('level', e.target.value)} aria-label="Level">
            <option value="">All levels</option>
            {options.levels.map((l) => <option key={l} value={l}>Level {l}</option>)}
          </Select>
          <Select value={f.credits} onChange={(e) => setFilter('credits', e.target.value)} aria-label="Credits">
            <option value="">Any credits</option>
            {options.credits.map((c) => <option key={c} value={c}>{c} credits</option>)}
          </Select>
          <Select value={f.availability} onChange={(e) => setFilter('availability', e.target.value)} aria-label="Availability">
            <option value="">Any availability</option>
            <option value="seats">Seats available</option>
            <option value="eligible">I can register</option>
          </Select>
          <Select value={f.type} onChange={(e) => setFilter('type', e.target.value)} aria-label="Course type">
            <option value="">Core & elective</option>
            <option value="core">Core</option>
            <option value="elective">Elective</option>
          </Select>
        </div>
        {active && (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
            <span>{filtered.length} of {courses.length} courses</span>
            <button onClick={() => { setQ(''); setParams({}, { replace: true }) }} className="font-medium text-brand-600 hover:text-brand-700">
              Clear filters
            </button>
          </div>
        )}
      </Card>

      <QueryState query={available} loadingLabel="Loading courses…">
        {() => (filtered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                departmentName={deptName.get(c.departmentId)}
                onAdd={addSection}
                onWaitlist={joinWaitlist}
                pendingId={pendingId}
                waitlisted={waitlisted}
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState title={courses.length ? 'No courses match your filters' : 'No courses available'} icon={BookOpen}>
              {!courses.length && 'Your program has no courses offered this semester yet.'}
            </EmptyState>
          </Card>
        ))}
      </QueryState>
      {dialog}
    </div>
  )
}
