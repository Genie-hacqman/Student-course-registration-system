import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApi } from '../../api/admin'
import { Card, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { formatDateTime, fullName } from '../../lib/format'

const ENTITY_TYPES = ['Registration', 'User', 'Student', 'Course', 'CourseSection', 'Semester', 'Result', 'Setting', 'Waitlist']

function Details({ log }) {
  const [open, setOpen] = useState(false)
  const hasMeta = log.metadata && Object.keys(log.metadata).length > 0
  if (!hasMeta && !log.requestId) return <span className="text-slate-400">—</span>
  return (
    <div>
      <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Details
      </button>
      {open && (
        <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
          {JSON.stringify({ ...(hasMeta ? log.metadata : {}), ip: log.ipAddress ?? undefined, requestId: log.requestId ?? undefined }, null, 2)}
        </pre>
      )}
    </div>
  )
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams()
  const [action, setAction] = useState(params.get('action') ?? '')
  const logs = useApi('/admin/audit-logs', {
    action: params.get('action') || undefined,
    entityType: params.get('entityType') || undefined,
    userId: params.get('userId') || undefined,
    page: Number(params.get('page') ?? 1),
    limit: 50,
  })

  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every sign-in, registration change, grade change and admin action, newest first." />
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-3">
        <form onSubmit={(e) => { e.preventDefault(); set('action', action.trim()) }}>
          <Input value={action} onChange={(e) => setAction(e.target.value)} onBlur={() => set('action', action.trim())} placeholder="Exact action, e.g. registration.approved" aria-label="Action" />
        </form>
        <Select value={params.get('entityType') ?? ''} onChange={(e) => set('entityType', e.target.value)} aria-label="Record type">
          <option value="">Any record type</option>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        {params.get('userId') && (
          <button onClick={() => set('userId', '')} className="justify-self-start text-sm font-medium text-brand-600">Showing one user · clear</button>
        )}
      </Card>
      <Card>
        <QueryState query={logs}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty="No matching entries"
              columns={[
                { key: 'createdAt', header: 'When', className: 'whitespace-nowrap', render: (l) => formatDateTime(l.createdAt) },
                {
                  key: 'user', header: 'Who', render: (l) => (l.user
                    ? <button className="text-left hover:text-brand-700" onClick={() => set('userId', String(l.user.id))}>{fullName(l.user)}<p className="text-xs text-slate-500">{l.user.email}</p></button>
                    : <span className="text-slate-400">System / unknown</span>),
                },
                { key: 'action', header: 'Action', render: (l) => <button className="font-mono text-xs hover:text-brand-700" onClick={() => { setAction(l.action); set('action', l.action) }}>{l.action}</button> },
                { key: 'entity', header: 'Record', render: (l) => (l.entityType ? `${l.entityType}${l.entityId ? ` #${l.entityId}` : ''}` : '—') },
                { key: 'details', header: '', render: (l) => <Details log={l} /> },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </div>
  )
}
