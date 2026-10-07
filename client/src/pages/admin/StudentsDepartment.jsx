import { Link, useParams } from 'react-router-dom'
import { ChevronRight, ExternalLink } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, CardHeader, EmptyState, ErrorState, Loading } from '../../components/ui'
import OrgStatusBadge from '../../components/directory/OrgStatusBadge'
import BackLink from '../../components/directory/BackLink'
import { plural, useStudentSummary } from '../../lib/studentSummary'
import { can, PERMS } from '../../lib/roles'

/** One department of the Students section: its programmes with student counts. Each opens the programme's students. */
export default function StudentsDepartment() {
  const { departmentId } = useParams()
  const { user } = useAuth()
  const summary = useStudentSummary()

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
  const department = summary.data.departments.find((d) => String(d.id) === departmentId)
  const back = <BackLink to="/staff/students">Students</BackLink>
  if (!department) {
    return (
      <div className="space-y-6">
        {back}
        <Card><EmptyState title="Department not found">It may have been removed. Go back to the list of departments.</EmptyState></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {back}
      <Card className="flex flex-wrap items-start justify-between gap-4 p-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{department.code}</p>
          <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{department.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {plural(department.students, 'student', 'students')} · {plural(department.programs.length, 'programme', 'programmes')}
          </p>
          <div className="mt-2"><OrgStatusBadge status={department.status} /></div>
        </div>
        {can(user, PERMS.DIRECTORY_VIEW) && (
          <Link to={`/staff/departments/${department.id}`}>
            <Button variant="secondary"><ExternalLink className="size-4" aria-hidden /> Open department page</Button>
          </Link>
        )}
      </Card>

      <Card>
        <CardHeader title="Programmes" subtitle="Choose a programme to see its students." />
        {department.programs.length === 0 ? (
          <EmptyState title="No programmes yet" compact>This department has no programmes, so it has no students.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Programmes">
            {department.programs.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/staff/students/programs/${p.id}`}
                  className="group flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-600"
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
                  <span className="flex items-center gap-2 text-sm tabular-nums text-slate-700">
                    {plural(p.students, 'student', 'students')}
                    <ChevronRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
