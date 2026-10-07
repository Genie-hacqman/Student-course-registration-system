import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, X } from 'lucide-react'
import { useRegistrations } from '../../api/staff'
import { Button, Card, EmptyState, PageHeader, QueryState, SkeletonTable, StatusBadge, cx } from '../../components/ui'
import { SemesterSelect, useSemesterParam } from '../../components/staff'
import { formatDateTime, fullName } from '../../lib/format'

const TABS = [
  ['submitted', 'Awaiting approval'],
  ['approved', 'Approved'],
  ['rejected', 'Needs changes'],
  ['draft', 'Draft'],
  ['', 'All'],
]

export default function Registrations() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { semesterId, setSemesterId, semesters } = useSemesterParam()
  const status = params.get('status') ?? 'submitted'
  const page = Number(params.get('page') ?? 1)
  const studentId = params.get('student')
  const list = useRegistrations({ status: status || undefined, semesterId: studentId ? undefined : semesterId, studentId, page })

  const set = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => next.set(k, v))
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Registrations"
        subtitle="Review submitted registrations and monitor progress."
        action={<SemesterSelect value={semesterId} onChange={setSemesterId} semesters={semesters} />}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {studentId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            One student · all semesters
            <button onClick={() => { const next = new URLSearchParams(params); next.delete('student'); setParams(next, { replace: true }) }} aria-label="Clear student filter">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        {TABS.map(([value, label]) => (
          <button
            key={label}
            aria-pressed={status === value}
            onClick={() => set({ status: value, page: 1 })}
            className={cx(
              'rounded-full px-3 py-1 text-sm font-medium',
              status === value ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Card>
        <QueryState query={list} fallback={<SkeletonTable rows={6} cols={5} />} errorTitle="Unable to load registrations">
          {({ items, meta }) => (items.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-xs tracking-wide text-slate-500 uppercase">
                    <tr>
                      <th className="px-5 py-3 font-medium">Student</th>
                      <th className="py-3 font-medium">Student no.</th>
                      <th className="py-3 font-medium">Level</th>
                      <th className="py-3 font-medium">Credits</th>
                      <th className="py-3 font-medium">Submitted</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((r) => {
                      return (
                        <tr
                          key={r.id}
                          onClick={() => navigate(`/staff/registrations/${r.id}`)}
                          className="cursor-pointer hover:bg-slate-50"
                        >
                          <td className="px-5 py-3">
                            <Link to={`/staff/registrations/${r.id}`} className="font-medium hover:text-brand-700" onClick={(e) => e.stopPropagation()}>
                              {fullName(r.student?.user)}
                            </Link>
                            <p className="text-xs text-slate-500">{r.student?.user?.email}</p>
                          </td>
                          <td className="py-3 tabular-nums">{r.student?.studentNumber}</td>
                          <td className="py-3">{r.student?.level}</td>
                          <td className="py-3 tabular-nums">{r.totalCredits}</td>
                          <td className="py-3 text-slate-600">{r.submittedAt ? formatDateTime(r.submittedAt) : '—'}</td>
                          <td className="px-5 py-3"><StatusBadge status={r.status} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {meta.totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => set({ page: page - 1 })}>Previous</Button>
                  <span className="text-slate-500">Page {meta.page} of {meta.totalPages} · {meta.total} registrations</span>
                  <Button variant="secondary" size="sm" disabled={page >= meta.totalPages} onClick={() => set({ page: page + 1 })}>Next</Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState title={status === 'submitted' ? 'Nothing awaiting approval' : 'No registrations'} icon={ClipboardList}>
              {status === 'submitted' && 'New submissions appear here automatically.'}
            </EmptyState>
          ))}
        </QueryState>
      </Card>
    </div>
  )
}
