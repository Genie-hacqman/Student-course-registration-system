import { Laptop, Smartphone } from 'lucide-react'
import { Badge } from '../ui'
import DataTable from './DataTable'
import { describeDevice, formatDateTime, fullName } from '../../lib/format'
import { ROLE_LABELS } from '../../lib/roles'

/** Sign-in history rows from GET /admin/sign-ins. `showPerson` is off on a single user's page. */
export default function SignInTable({ rows, meta, onPage, showPerson = true, onPerson }) {
  return (
    <DataTable
      rows={rows}
      meta={meta}
      onPage={onPage}
      empty="No sign-ins recorded"
      columns={[
        { key: 'at', header: 'When', className: 'whitespace-nowrap', render: (s) => formatDateTime(s.at) },
        ...(showPerson ? [{
          key: 'who', header: 'Person', render: (s) => (s.user ? (
            <button type="button" className="text-left hover:text-brand-700" onClick={() => onPerson?.(s.user)}>
              <span className="font-medium">{fullName(s.user)}</span>
              <p className="text-xs text-slate-500">{s.user.email} · {ROLE_LABELS[s.user.role]}</p>
            </button>
          ) : <span className="text-slate-500">{s.email ?? 'Unknown'} <span className="text-xs">(no such account)</span></span>),
        }] : []),
        {
          key: 'device', header: 'Device', render: (s) => {
            const d = describeDevice(s.userAgent)
            const Icon = d.mobile ? Smartphone : Laptop
            return <span className="inline-flex items-center gap-1.5" title={s.userAgent ?? ''}><Icon className="size-4 text-slate-400" /> {d.label}</span>
          },
        },
        { key: 'ip', header: 'IP address', render: (s) => <span className="font-mono text-xs">{s.ipAddress ?? '—'}</span> },
        { key: 'result', header: 'Result', render: (s) => (s.success ? <Badge tone="green">Signed in</Badge> : <Badge tone="red">Failed</Badge>) },
      ]}
    />
  )
}
