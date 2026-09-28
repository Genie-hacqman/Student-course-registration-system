import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApi } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Card, Input, PageHeader, QueryState, SearchInput, Select } from '../../components/ui'
import SignInTable from '../../components/admin/SignInTable'
import { PERMS, ROLE_LABELS, can } from '../../lib/roles'

const endOfDay = (d) => (d ? `${d}T23:59:59` : undefined)

export default function SignIns() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const signIns = useApi('/admin/sign-ins', {
    role: params.get('role') || undefined,
    result: params.get('result') || undefined,
    search: params.get('search') || undefined,
    from: params.get('from') || undefined,
    to: endOfDay(params.get('to')),
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
  const hasFilters = params.get('search') || params.get('role') || params.get('result') || params.get('from') || params.get('to')

  return (
    <div>
      <PageHeader title="Sign-in activity" subtitle="Every sign-in and failed attempt, with the time, device and IP address it came from." />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <SearchInput
          key={params.get('search') ?? ''}
          className="w-full sm:w-64"
          defaultValue={params.get('search') ?? ''}
          onSearch={(v) => set('search', v)}
          placeholder="Name or email, then Enter"
          aria-label="Search sign-ins"
        />
        <Select value={params.get('role') ?? ''} onChange={(e) => set('role', e.target.value)} aria-label="Role" className="w-full sm:w-auto">
          <option value="">Everyone</option>
          {Object.entries(ROLE_LABELS).map(([role, label]) => <option key={role} value={role}>{label}s</option>)}
        </Select>
        <Select value={params.get('result') ?? ''} onChange={(e) => set('result', e.target.value)} aria-label="Result" className="w-full sm:w-auto">
          <option value="">Successful & failed</option>
          <option value="success">Successful</option>
          <option value="failed">Failed</option>
        </Select>
        <Input type="date" aria-label="From" value={params.get('from') ?? ''} onChange={(e) => set('from', e.target.value)} className="w-full sm:w-auto" />
        <Input type="date" aria-label="To" value={params.get('to') ?? ''} onChange={(e) => set('to', e.target.value)} className="w-full sm:w-auto" />
        {hasFilters && <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
      </Card>
      <Card>
        <QueryState query={signIns}>
          {({ items, meta }) => (
            <SignInTable
              rows={items}
              meta={meta}
              onPage={(n) => set('page', String(n))}
              onPerson={can(user, PERMS.USER_MANAGE) ? (u) => navigate(`/staff/users/${u.id}`) : undefined}
            />
          )}
        </QueryState>
      </Card>
      <p className="mt-3 text-xs text-slate-500">Devices are recorded from the moment sign-in tracking was switched on; older sign-ins show “Unknown device”.</p>
    </div>
  )
}
