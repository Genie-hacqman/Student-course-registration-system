import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../../api/admin'
import { Card, PageHeader, QueryState, SearchInput, StatusBadge, Tabs } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { APPLICATION_STATUS, formatDateTime } from '../../lib/format'

const TABS = [
  { value: 'submitted', label: 'Pending review' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'rejected', label: 'Not admitted' },
  { value: '', label: 'All' },
]

/** Online admission applications (drafts stay private to the applicant until submitted). */
export default function Applications() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'submitted'
  const page = Number(params.get('page') ?? 1)
  const search = params.get('search') ?? ''
  const applications = useApi('/applications', { status: status || undefined, search: search || undefined, page, limit: 20 })
  const set = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => next.set(k, v))
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader title="Admission applications" subtitle="Review online applications. Admitting creates the student record, Student ID and school email, and emails an activation link." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs items={TABS} value={status} onChange={(value) => set({ status: value, page: 1 })} />
        <SearchInput defaultValue={search} onSearch={(value) => set({ search: value, page: 1 })} placeholder="Search name or email" className="w-64" />
      </div>
      <Card>
        <QueryState query={applications}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set({ page: n })}
              onRowClick={(a) => navigate(`/staff/applications/${a.id}`)}
              empty={status === 'submitted' ? 'No applications waiting for review' : 'No applications'}
              columns={[
                { key: 'submitted', header: 'Submitted', className: 'whitespace-nowrap', render: (a) => formatDateTime(a.submittedAt) },
                {
                  key: 'who', header: 'Applicant', render: (a) => (
                    <div className="leading-tight">
                      <p className="font-medium">{a.firstName} {a.lastName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{a.personalEmail}</p>
                    </div>
                  ),
                },
                { key: 'program', header: 'Programme', render: (a) => `${a.program?.name ?? '—'} · Level ${a.entryLevel ?? '—'}` },
                {
                  key: 'status', header: 'Status', render: (a) => {
                    const [tone, label] = APPLICATION_STATUS[a.status]
                    return (
                      <div className="leading-tight">
                        <StatusBadge status={a.status} tone={tone} label={label} />
                        {a.student && <p className="mt-1 text-xs text-slate-500">{a.student.studentNumber}</p>}
                      </div>
                    )
                  },
                },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </div>
  )
}
