import { useParams } from 'react-router-dom'
import { Card, EmptyState, ErrorState, Loading } from '../../components/ui'
import OrgStatusBadge from '../../components/directory/OrgStatusBadge'
import ProgramStudentList from '../../components/directory/ProgramStudentList'
import BackLink from '../../components/directory/BackLink'
import { plural, useStudentSummary } from '../../lib/studentSummary'

/** One programme of the Students section: level tabs with counts, search, and its students. */
export default function StudentsProgram() {
  const { programId } = useParams()
  const summary = useStudentSummary()

  if (summary.isPending) return <Loading />
  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
  const department = summary.data.departments.find((d) => d.programs.some((p) => String(p.id) === programId))
  const program = department?.programs.find((p) => String(p.id) === programId)
  if (!program) {
    return (
      <div className="space-y-6">
        <BackLink to="/staff/students">Students</BackLink>
        <Card><EmptyState title="Programme not found">It may have been removed. Go back to the list of departments.</EmptyState></Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackLink to={`/staff/students/departments/${department.id}`}>{department.name}</BackLink>
      <Card className="p-6">
        <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{program.code} · {department.name}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{program.name}</h1>
        <p className="mt-1 text-sm text-slate-600">{plural(program.students, 'student', 'students')}</p>
        <div className="mt-2"><OrgStatusBadge status={program.status} /></div>
      </Card>
      <Card>
        <ProgramStudentList programId={program.id} levels={program.levels} />
      </Card>
    </div>
  )
}
