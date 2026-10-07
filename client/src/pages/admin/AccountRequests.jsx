import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { z } from 'zod'
import { http, useApi, useApiMutation } from '../../api/admin'
import { Badge, Button, Card, PageHeader, QueryState, Tabs } from '../../components/ui'
import DataTable from '../../components/admin/DataTable'
import FormModal, { Textarea } from '../../components/admin/FormModal'
import { REQUEST_STATUS, REQUEST_TYPE } from '../../components/account/ChangeRequests'
import { formatDateTime, fullName } from '../../lib/format'
import { ROLE_LABELS } from '../../lib/roles'

const TABS = [
  { value: 'pending', label: 'Waiting' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Declined' },
  { value: '', label: 'All' },
]

const approveSchema = z.object({ note: z.string().trim().max(500).optional() })
const rejectSchema = z.object({ note: z.string().trim().min(3, 'Tell them why (at least 3 characters)').max(500) })

const effectOf = (r) => (r.type === 'password_reset'
  ? `${r.user?.firstName} will be emailed a link to choose a new password (${r.user?.email}).`
  : `${fullName(r.user)} will be renamed to ${r.firstName} ${r.lastName}.`)

export default function AccountRequests() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'pending'
  const page = Number(params.get('page') ?? 1)
  const requests = useApi('/admin/account-requests', { status: status || undefined, page, limit: 20 })
  const [deciding, setDeciding] = useState(null)
  const decide = useApiMutation(({ id, decision, note }) => http.patch(`/admin/account-requests/${id}/${decision}`, note ? { note } : {}), {
    success: (_d, v) => (v.decision === 'approve' ? 'Request approved' : 'Request declined'),
  })
  const set = (changes) => {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => next.set(k, v))
    setParams(next, { replace: true })
  }
  const approving = deciding?.decision === 'approve'

  return (
    <div>
      <PageHeader title="Account requests" subtitle="Registrars’ and lecturers’ password resets and name changes wait here for an admin’s approval. Admins change their own directly." />
      <Tabs className="mb-4" items={TABS} value={status} onChange={(value) => set({ status: value, page: 1 })} />
      <Card>
        <QueryState query={requests}>
          {({ items, meta }) => (
            <DataTable
              rows={items}
              meta={meta}
              onPage={(n) => set({ page: n })}
              empty={status === 'pending' ? 'Nothing waiting for approval' : 'No requests'}
              columns={[
                { key: 'when', header: 'Requested', className: 'whitespace-nowrap', render: (r) => formatDateTime(r.createdAt) },
                {
                  key: 'who', header: 'Person', render: (r) => (
                    <div className="leading-tight">
                      <p className="font-medium">{fullName(r.user)}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{r.user?.email}</p>
                      <Badge tone="slate">{ROLE_LABELS[r.user?.role?.name]}</Badge>
                    </div>
                  ),
                },
                {
                  key: 'what', header: 'Request', render: (r) => (
                    <div className="leading-tight">
                      <p className="font-medium">{REQUEST_TYPE[r.type]}</p>
                      {r.type === 'name_change' && <p className="mt-0.5 text-slate-600">→ {r.firstName} {r.lastName}</p>}
                      {r.note && <p className="mt-0.5 max-w-64 truncate text-xs text-slate-500" title={r.note}>“{r.note}”</p>}
                    </div>
                  ),
                },
                {
                  key: 'status', header: 'Status', render: (r) => (
                    <div className="leading-tight">
                      <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge>
                      {r.reviewer && (
                        <p className="mt-1 max-w-56 truncate text-xs text-slate-500" title={r.reviewNote ? `by ${fullName(r.reviewer)} — ${r.reviewNote}` : undefined}>
                          by {fullName(r.reviewer)}{r.reviewNote ? ` — “${r.reviewNote}”` : ''}
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: 'actions', header: '', className: 'text-right', render: (r) => r.status === 'pending' && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setDeciding({ ...r, decision: 'reject' })}><X className="size-4" /> Decline</Button>
                      <Button size="sm" onClick={() => setDeciding({ ...r, decision: 'approve' })}><Check className="size-4" /> Approve</Button>
                    </div>
                  ),
                },
              ]}
            />
          )}
        </QueryState>
      </Card>

      <FormModal
        open={Boolean(deciding)}
        onClose={() => setDeciding(null)}
        title={approving ? `Approve ${REQUEST_TYPE[deciding?.type]?.toLowerCase()}` : `Decline ${REQUEST_TYPE[deciding?.type]?.toLowerCase()}`}
        schema={approving ? approveSchema : rejectSchema}
        defaultValues={{ note: '' }}
        onSubmit={(v) => decide.mutateAsync({ id: deciding.id, decision: deciding.decision, note: v.note || undefined })}
        submitLabel={approving ? 'Approve' : 'Decline'}
      >
        {({ register, formState: { errors } }) => (
          <>
            <p className="text-sm text-slate-600">{approving ? effectOf(deciding) : `${deciding?.user?.firstName} will be told it was declined, with your reason.`}</p>
            <Textarea label={approving ? 'Note (optional)' : 'Reason'} error={errors.note?.message} {...register('note')} />
          </>
        )}
      </FormModal>
    </div>
  )
}
