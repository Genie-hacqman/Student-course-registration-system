import { Building2, ChevronRight } from 'lucide-react'
import { useApi } from '../../api/admin'
import { Card, CardHeader, Skeleton, cx } from '../ui'
import OrgStatusBadge from './OrgStatusBadge'

const chip = (active) => cx(
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 transition',
  active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-700 ring-slate-200 hover:ring-brand-300',
)

/**
 * Student counts by department, drilling down to programme and then level. Every count comes from the server
 * (/students/summary). Choosing a card or chip calls `onSelect({ departmentId, programId, level })`.
 */
export default function DepartmentOverview({ departmentId, programId, level, onSelect }) {
  const summary = useApi('/students/summary')
  const departments = summary.data?.departments ?? []
  const department = departments.find((d) => String(d.id) === String(departmentId))
  const program = department?.programs.find((p) => String(p.id) === String(programId))

  return (
    <Card className="mb-4">
      <CardHeader
        title="Students by department"
        subtitle={summary.data
          ? `${summary.data.total} ${summary.data.total === 1 ? 'student' : 'students'} across ${departments.length} ${departments.length === 1 ? 'department' : 'departments'}. Choose one to drill down.`
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
                    'rounded-xl p-4 text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-brand-600',
                    active ? 'bg-brand-50 ring-brand-500' : 'bg-white ring-slate-200 hover:ring-brand-300',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{d.code}</span>
                    {d.status === 'archived' && <OrgStatusBadge status={d.status} />}
                  </div>
                  <p className="mt-1 truncate font-medium text-slate-900" title={d.name}>{d.name}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{d.students}</p>
                  <p className="text-xs text-slate-500">{d.students === 1 ? 'student' : 'students'} · {d.programs.length} {d.programs.length === 1 ? 'programme' : 'programmes'}</p>
                </button>
              )
            })}
          </div>
        )}

        {department && (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <p className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
              <span className="font-medium text-slate-900">{department.name}</span>
              <ChevronRight className="size-4 text-slate-400" aria-hidden /> Programmes
            </p>
            {department.programs.length === 0 ? (
              <p className="text-sm text-slate-500">This department has no programmes yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Programmes">
                <button type="button" className={chip(!programId)} onClick={() => onSelect({ departmentId: department.id })}>All programmes</button>
                {department.programs.map((p) => (
                  <button key={p.id} type="button" className={chip(String(p.id) === String(programId))} onClick={() => onSelect({ departmentId: department.id, programId: p.id })}>
                    {p.code} <span className="tabular-nums opacity-80">{p.students}</span>
                  </button>
                ))}
              </div>
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
