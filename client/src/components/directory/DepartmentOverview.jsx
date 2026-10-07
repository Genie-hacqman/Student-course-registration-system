import { Link } from 'react-router-dom'
import { Building2, ChevronRight } from 'lucide-react'
import { plural, useStudentSummary } from '../../lib/studentSummary'
import { Card, CardHeader, Skeleton, cx } from '../ui'
import OrgStatusBadge from './OrgStatusBadge'

/**
 * Student counts by department. Each card opens that department's own page
 * (/staff/students/departments/:id), which lists its programmes.
 */
export default function DepartmentOverview() {
  const summary = useStudentSummary()
  const departments = summary.data?.departments ?? []

  return (
    <Card className="mb-4">
      <CardHeader
        title="Students by department"
        subtitle={summary.data
          ? `${plural(summary.data.total, 'student', 'students')} across ${plural(departments.length, 'department', 'departments')}. Click a department to see its programmes.`
          : 'Loading counts…'}
        icon={Building2}
      />
      <div className="p-4">
        {summary.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : summary.isError ? (
          <p className="text-sm text-red-600">Couldn't load the department counts.</p>
        ) : departments.length === 0 ? (
          <p className="text-sm text-slate-500">No departments yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {departments.map((d) => (
              <Link
                key={d.id}
                to={`/staff/students/departments/${d.id}`}
                className={cx(
                  'group rounded-xl bg-white p-4 text-left ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-300',
                  'focus-visible:outline-2 focus-visible:outline-brand-600',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{d.code}</span>
                  <span className="flex items-center gap-1.5">
                    {d.status === 'archived' && <OrgStatusBadge status={d.status} />}
                    <ChevronRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
                  </span>
                </div>
                <p className="mt-1 truncate font-medium text-slate-900" title={d.name}>{d.name}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{d.students}</p>
                <p className="text-xs text-slate-500">{d.students === 1 ? 'student' : 'students'} · {plural(d.programs.length, 'programme', 'programmes')}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}
