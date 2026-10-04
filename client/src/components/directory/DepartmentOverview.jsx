import { Link } from 'react-router-dom'
import { Building2, ChevronDown, ChevronRight, ExternalLink, X } from 'lucide-react'
import { useApi } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, CardHeader, Skeleton, cx } from '../ui'
import { can, PERMS } from '../../lib/roles'
import OrgStatusBadge from './OrgStatusBadge'

const chip = (active) => cx(
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 transition',
  active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-brand-300',
)

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * Student counts by department, drilling down to programme and then level. Every count comes from the server
 * (/students/summary). Choosing a card, programme or chip calls `onSelect({ departmentId, programId, level })`.
 */
export default function DepartmentOverview({ departmentId, programId, level, onSelect }) {
  const { user } = useAuth()
  const summary = useApi('/students/summary')
  const departments = summary.data?.departments ?? []
  const department = departments.find((d) => String(d.id) === String(departmentId))
  const program = department?.programs.find((p) => String(p.id) === String(programId))

  return (
    <Card className="mb-4">
      <CardHeader
        title="Students by department"
        subtitle={summary.data
          ? `${plural(summary.data.total, 'student', 'students')} across ${plural(departments.length, 'department', 'departments')}. Click a department to see its programmes and students.`
          : 'Loading counts…'}
        icon={Building2}
      />
      <div className="space-y-4 p-4">
        {summary.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : summary.isError ? (
          <p className="text-sm text-red-600">Couldn't load the department counts.</p>
        ) : departments.length === 0 ? (
          <p className="text-sm text-slate-500">No departments yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {departments.map((d) => {
              const active = String(d.id) === String(departmentId)
              return (
                <button
                  key={d.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onSelect(active ? {} : { departmentId: d.id })}
                  className={cx(
                    'group cursor-pointer rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-brand-600',
                    active ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-1 ring-slate-200 hover:ring-brand-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{d.code}</span>
                    <span className="flex items-center gap-1.5">
                      {d.status === 'archived' && <OrgStatusBadge status={d.status} />}
                      {active
                        ? <ChevronDown className="size-4 text-brand-600" aria-hidden />
                        : <ChevronRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-medium text-slate-900" title={d.name}>{d.name}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{d.students}</p>
                  <p className="text-xs text-slate-500">{d.students === 1 ? 'student' : 'students'} · {plural(d.programs.length, 'programme', 'programmes')}</p>
                </button>
              )
            })}
          </div>
        )}

        {department && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {department.name}
                  <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{department.code}</span>
                  {department.status === 'archived' && <OrgStatusBadge status={department.status} />}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  {plural(department.students, 'student', 'students')} · {plural(department.programs.length, 'programme', 'programmes')} assigned
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can(user, PERMS.DIRECTORY_VIEW) && (
                  <Link to={`/staff/departments/${department.id}`}>
                    <Button variant="secondary" size="sm"><ExternalLink className="size-4" aria-hidden /> Open department page</Button>
                  </Link>
                )}
                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => onSelect({})}><X className="size-4" aria-hidden /> Clear selection</Button>
              </div>
            </div>

            {department.programs.length === 0 ? (
              <p className="text-sm text-slate-500">This department has no programmes yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200" aria-label="Programmes">
                {department.programs.map((p) => {
                  const selected = String(p.id) === String(programId)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onSelect(selected ? { departmentId: department.id } : { departmentId: department.id, programId: p.id })}
                        className={cx(
                          'flex w-full cursor-pointer flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-left transition first:rounded-t-xl last:rounded-b-xl focus-visible:outline-2 focus-visible:outline-brand-600',
                          selected ? 'bg-brand-50' : 'hover:bg-slate-50',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-slate-900">{p.code}</span>
                            <span className="text-sm text-slate-600">{p.name}</span>
                            {p.status === 'archived' && <OrgStatusBadge status={p.status} />}
                          </span>
                          {p.levels.length > 0 && (
                            <span className="mt-0.5 block text-xs text-slate-500">{p.levels.map((l) => `L${l.level}: ${l.students}`).join(' · ')}</span>
                          )}
                        </span>
                        <span className="text-sm tabular-nums text-slate-700">{plural(p.students, 'student', 'students')}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {program && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Levels">
                <button type="button" className={chip(!level)} onClick={() => onSelect({ departmentId: department.id, programId: program.id })}>All levels</button>
                {program.levels.length === 0 && <span className="text-sm text-slate-500">No students on this programme yet.</span>}
                {program.levels.map((l) => (
                  <button key={l.level} type="button" className={chip(String(l.level) === String(level))} onClick={() => onSelect({ departmentId: department.id, programId: program.id, level: l.level })}>
                    Level {l.level} <span className="tabular-nums opacity-80">{l.students}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
