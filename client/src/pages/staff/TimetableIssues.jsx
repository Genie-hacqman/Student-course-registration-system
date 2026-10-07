import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { useAuth } from '../../auth/AuthProvider'
import { Badge, Button, Card, PageHeader, QueryState, Tabs } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Textarea } from '../../components/admin/FormModal'
import { ISSUE_TYPES } from '../../components/admin/TimetableIssueList'
import { formatDateTime, fullName } from '../../lib/format'
import { PERMS, can } from '../../lib/roles'

const TABS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
  { value: '', label: 'All' },
]
const resolveSchema = z.object({ note: z.string().trim().min(3, 'Say what was done (at least 3 characters)').max(500) })

export default function TimetableIssues() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'open'
  const page = Number(params.get('page') ?? 1)
  const issues = useApi('/admin/timetable-issues', { status: status || undefined, page, limit: 20 })
  const [resolving, setResolving] = useState(null)
  const resolve = useApiMutation(({ id, note }) => http.post(`/admin/timetable-issues/${id}/resolve`, { note }), { success: 'Issue marked resolved' })
  const set = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => next.set(k, v))
    setParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        title="Timetable issues"
        subtitle="Clashes that stopped a registration from being approved. Fix the cause (schedule, room, lecturer or course list), then approve the registration again."
      />
      <Tabs className="mb-4" items={TABS} value={status} onChange={(value) => set({ status: value, page: 1 })} />
      <Card>
        <QueryState query={issues}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set({ page: n })}
              empty={status === 'open' ? 'No open timetable issues' : 'No issues'}
              columns={[
                { key: 'when', header: 'Found', className: 'whitespace-nowrap', render: (i) => formatDateTime(i.updatedAt) },
                {
                  key: 'student', header: 'Registration', render: (i) => (
                    <div className="leading-tight">
                      <Link to={`/staff/registrations/${i.registrationId}`} className="font-medium text-brand-700 hover:underline">
                        {fullName(i.registration?.student?.user)}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">{i.registration?.student?.studentNumber} · {i.registration?.status}</p>
                    </div>
                  ),
                },
                {
                  key: 'issue', header: 'Issue', render: (i) => (
                    <div className="leading-tight">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {i.section?.course?.code}
                        <Badge tone={ISSUE_TYPES[i.type]?.tone}>{ISSUE_TYPES[i.type]?.label ?? i.type}</Badge>
                      </p>
                      {(i.details ?? []).map((d, n) => <p key={n} className="mt-0.5 text-sm text-slate-600">{d.message}</p>)}
                    </div>
                  ),
                },
                {
                  key: 'status', header: 'Status', render: (i) => (
                    <div className="leading-tight">
                      <Badge tone={i.status === 'open' ? 'red' : 'green'}>{i.status === 'open' ? 'Open' : 'Resolved'}</Badge>
                      {i.resolutionNote && (
                        <p className="mt-1 max-w-56 truncate text-xs text-slate-500" title={i.resolutionNote}>
                          {i.resolver ? `${fullName(i.resolver)} — ` : ''}“{i.resolutionNote}”
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'actions', header: '', className: 'text-right', render: (i) => i.status === 'open' && can(user, PERMS.REGISTRATION_APPROVE) && (
                    <Button size="sm" variant="secondary" onClick={() => setResolving(i)}><Check className="size-4" /> Mark resolved</Button>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <FormModal
        open={Boolean(resolving)}
        onClose={() => setResolving(null)}
        title="Mark issue resolved"
        schema={resolveSchema}
        defaultValues={{ note: '' }}
        onSubmit={(v) => resolve.mutateAsync({ id: resolving.id, note: v.note })}
        submitLabel="Mark resolved"
      >
        {({ register, formState: { errors } }) => (
          <>
            <p className="text-sm text-slate-600">
              This records what was done; it doesn't approve the registration. Approving again re-checks the timetable, and reopens this issue if the clash is still there.
            </p>
            <Textarea label="What was done" error={errors.note?.message} {...register('note')} />
          </>
        )}
      </FormModal>
    </div>
  )
}
