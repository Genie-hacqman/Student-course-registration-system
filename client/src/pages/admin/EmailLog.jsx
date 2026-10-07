import { useSearchParams } from 'react-router-dom'
import { useApi } from '../../api/admin'
import { Badge, Card, PageHeader, QueryState, SearchInput, Tabs } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import { formatDateTime } from '../../lib/format'

const STATUS = {
  sent: { label: 'Accepted', tone: 'blue' },
  delivered: { label: 'Delivered', tone: 'green' },
  delivery_delayed: { label: 'Delayed', tone: 'amber' },
  failed: { label: 'Failed', tone: 'red' },
  bounced: { label: 'Bounced', tone: 'red' },
  complained: { label: 'Marked as spam', tone: 'red' },
  not_configured: { label: 'Not configured', tone: 'slate' },
}

const TABS = [
  { value: '', label: 'All' },
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'sent', label: 'Accepted' },
  { value: 'delivered', label: 'Delivered' },
]

export default function EmailLog() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const search = params.get('search') ?? ''
  const page = Number(params.get('page') ?? 1)
  const deliveries = useApi('/admin/email-deliveries', { status: status || undefined, search: search || undefined, page, limit: 25 })
  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Email log"
        subtitle="Activation, password, registration and announcement emails. “Accepted” means the email service took it; “Delivered” is confirmed once the delivery webhook is set up."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs items={TABS} value={status} onChange={(v) => set('status', v)} />
        <SearchInput
          key={search}
          defaultValue={search}
          onSearch={(v) => set('search', v)}
          placeholder="Recipient email, then Enter"
          aria-label="Search by recipient"
          className="w-full sm:w-64"
        />
      </div>
      <Card>
        <QueryState query={deliveries}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              empty={status === 'failed' ? 'No failed emails' : 'No emails yet'}
              columns={[
                { key: 'when', header: 'Sent', className: 'whitespace-nowrap', render: (d) => formatDateTime(d.createdAt) },
                {
                  key: 'what', header: 'Email', render: (d) => (
                    <div className="leading-tight">
                      <p className="font-medium">{d.subject}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{d.template}{d.attempts > 1 ? ` · ${d.attempts} attempts` : ''}</p>
                    </div>
                  ),
                },
                { key: 'recipient', header: 'Recipient', render: (d) => <span className="break-all">{d.recipient}</span> },
                {
                  key: 'status', header: 'Status', render: (d) => (
                    <div className="leading-tight">
                      <Badge tone={STATUS[d.status]?.tone}>{STATUS[d.status]?.label ?? d.status}</Badge>
                      {d.error && <p className="mt-1 max-w-72 text-xs text-red-700">{d.error}</p>}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </div>
  )
}
