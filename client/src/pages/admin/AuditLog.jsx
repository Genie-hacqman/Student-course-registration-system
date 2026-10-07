import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useApi } from '../../api/admin'
import { Card, Input, PageHeader, QueryState, Select } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { formatDateTime, fullName } from '../../lib/format'
import { summariseMetadata } from '../../lib/auditMetadata'

/** The before/after lines the server records for edits and per-student changes, in plain words. */
function Summary({ lines }) {
  if (!lines.length) return null
  return (
    <ul className="mt-2 max-w-md space-y-0.5 text-xs text-slate-700">
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  )
}

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
        <>
          <Summary lines={summariseMetadata(log.metadata)} />
          <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify({
              ...(hasMeta ? log.metadata : {}),
              ip: log.ipAddress ?? undefined,
              browser: log.userAgent ?? undefined,
              requestId: log.requestId ?? undefined,
            }, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}

/** Actions that exist in the log, grouped the way the server catalogues them. */
function ActionSelect({ actions, value, onChange }) {
  const groups = new Map()
  for (const a of actions) groups.set(a.group, [...(groups.get(a.group) ?? []), a])
  // A link into the page may carry an action that has no rows yet; keep it selectable.
  const known = actions.some((a) => a.action === value)
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Action">
      <option value="">Any action</option>
      {value && !known && <option value={value}>{value}</option>}
      {[...groups].map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((a) => <option key={a.action} value={a.action}>{a.label}</option>)}
        </optgroup>
      ))}
    </Select>
  )
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams()
  // What the log actually contains, so the filters never lag behind what the server writes.
  const options = useApi('/admin/audit-logs/options')
  const entityTypes = options.data?.entityTypes ?? []
  const actions = options.data?.actions ?? []
  const logs = useApi('/admin/audit-logs', {
    action: params.get('action') || undefined,
    entityType: params.get('entityType') || undefined,
    userId: params.get('userId') || undefined,
    // A date picker gives "YYYY-MM-DD" (local); the end date covers that whole day.
    from: params.get('from') ? new Date(`${params.get('from')}T00:00:00`).toISOString() : undefined,
    to: params.get('to') ? new Date(`${params.get('to')}T23:59:59`).toISOString() : undefined,
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
      <Card className="mb-4 grid gap-3 p-4 md:grid-cols-4">
        <ActionSelect actions={actions} value={params.get('action') ?? ''} onChange={(v) => set('action', v)} />
        <Select value={params.get('entityType') ?? ''} onChange={(e) => set('entityType', e.target.value)} aria-label="Record type">
          <option value="">Any record type</option>
          {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <div className="flex items-center gap-2">
          <Input type="date" value={params.get('from') ?? ''} max={params.get('to') ?? undefined} onChange={(e) => set('from', e.target.value)} aria-label="From date" />
          <span className="text-slate-400">to</span>
          <Input type="date" value={params.get('to') ?? ''} min={params.get('from') ?? undefined} onChange={(e) => set('to', e.target.value)} aria-label="To date" />
        </div>
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
                    // The account may have been deleted since: the snapshot taken at the time still says who it was.
                    : l.actorEmail
                      ? <span>{l.actorEmail}<p className="text-xs text-slate-500">{l.actorRole ?? 'account removed'}</p></span>
                      : <span className="text-slate-400">System / unknown</span>),
                },
                {
                  key: 'action', header: 'Action', render: (l) => (
                    <button className="text-left hover:text-brand-700" onClick={() => set('action', l.action)}>
                      {l.actionLabel ?? l.action}
                      <p className="font-mono text-xs text-slate-500">{l.action}</p>
                    </button>
                  ),
                },
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
