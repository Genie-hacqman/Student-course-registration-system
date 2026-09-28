import { Award, BookOpenCheck, GraduationCap, Target } from 'lucide-react'
import { useResults } from '../../api/student'
import { Card, EmptyState, PageHeader, QueryState, SkeletonCards, StatusBadge } from '../../components/ui'
import { StatCard } from '../../components/dashboard/StatCard'

export default function Results() {
  const results = useResults()
  return (
    <div>
      <PageHeader title="Results" subtitle="Final grades only. Provisional grades appear once your lecturer finalises them." />
      <QueryState query={results} fallback={<SkeletonCards count={3} className="xl:grid-cols-3" />} errorTitle="Unable to load your results">
        {({ results: rows, summary }) => (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard index={0} label="Cumulative GPA" icon={Award} tone="violet" value={summary.gpa ?? '—'} decimals={2} />
              <StatCard index={1} label="Credits earned" icon={BookOpenCheck} tone="green" value={summary.creditsEarned} />
              <StatCard index={2} label="Credits attempted" icon={Target} value={summary.creditsAttempted} />
            </div>
            <Card>
              {rows.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                      <tr>
                        <th className="px-5 py-3 font-medium">Course</th>
                        <th className="py-3 font-medium">Semester</th>
                        <th className="py-3 font-medium">Credits</th>
                        <th className="py-3 font-medium">Grade</th>
                        <th className="px-5 py-3 font-medium">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r) => (
                        <tr key={r.id} className="transition-colors hover:bg-slate-50">
                          <td className="px-5 py-3"><span className="font-medium">{r.course.code}</span> <span className="text-slate-600">{r.course.title}</span></td>
                          <td className="py-3 text-slate-600">{r.semester?.name ?? '—'}</td>
                          <td className="py-3">{r.course.credits}</td>
                          <td className="py-3 font-semibold">{r.grade}</td>
                          <td className="px-5 py-3"><StatusBadge status={r.passed ? 'passed' : 'failed'} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState title="No results yet" icon={GraduationCap}>Final grades appear here once your lecturers publish them.</EmptyState>}
            </Card>
          </div>
        )}
      </QueryState>
    </div>
  )
}
