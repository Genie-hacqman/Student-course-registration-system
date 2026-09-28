import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { authApi } from '../../api/auth'
import { Badge, Button, Card, CardHeader, EmptyState, Input, QueryState } from '../ui'
import { applyServerErrors } from '../../lib/forms'
import { formatDateTime, fullName } from '../../lib/format'
import { ROLES, needsApproval } from '../../lib/roles'
import { NameForm, PasswordForm } from './Account'
import ChangePinForm from './ChangePinForm'

export const REQUEST_STATUS = {
  pending: { label: 'Waiting for approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Declined', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
}
export const REQUEST_TYPE = { password_reset: 'Password reset', name_change: 'Name change' }

const KEY = ['change-requests']

const useRequests = () => useQuery({ queryKey: KEY, queryFn: authApi.changeRequests })

const useCreateRequest = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: authApi.createChangeRequest, onSuccess: () => qc.invalidateQueries({ queryKey: KEY }) })
}

const nameSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
  note: z.string().trim().max(500).optional(),
})

function NameRequestForm({ pending }) {
  const { user } = useAuth()
  const create = useCreateRequest()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(nameSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '', note: '' },
  })
  const onSubmit = async (values) => {
    if (values.firstName === user.firstName && values.lastName === user.lastName) {
      setError('lastName', { message: 'This is already your name' })
      return
    }
    try {
      await create.mutateAsync({ type: 'name_change', ...values, note: values.note || undefined })
      reset({ ...values, note: '' })
      toast.success('Name change requested — the administrator will review it')
    } catch (err) {
      applyServerErrors(err, setError, ['firstName', 'lastName', 'note'])
    }
  }
  return (
    <Card>
      <CardHeader title="Your name" subtitle={`Currently ${fullName(user)}. Name changes are approved by the administrator.`} />
      {pending ? (
        <p className="px-5 py-4 text-sm text-amber-800">
          You asked to be renamed to <span className="font-medium">{pending.firstName} {pending.lastName}</span>. It's waiting for approval.
        </p>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-xl gap-4 px-5 py-5 sm:grid-cols-2" noValidate>
          <Input label="New first name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="New last name" error={errors.lastName?.message} {...register('lastName')} />
          <Input label="Reason (optional)" className="sm:col-span-2" placeholder="e.g. Spelling correction, marriage" error={errors.note?.message} {...register('note')} />
          <div><Button type="submit" loading={isSubmitting}>Request name change</Button></div>
        </form>
      )}
    </Card>
  )
}

function PasswordRequestCard({ pending }) {
  const create = useCreateRequest()
  const request = () => create.mutate({ type: 'password_reset' }, {
    onSuccess: () => toast.success('Password reset requested — you will get an email with a link once it is approved'),
    onError: (err) => toast.error(err.message),
  })
  return (
    <Card>
      <CardHeader title="Password" subtitle="For your security, password resets are approved by the administrator. Once approved, you get an email with a link to choose a new password." />
      <div className="flex items-center gap-3 px-5 py-4">
        <KeyRound className="size-5 text-slate-400" />
        {pending
          ? <p className="text-sm text-amber-800">Your password reset request is waiting for approval.</p>
          : <Button variant="secondary" loading={create.isPending} onClick={request}>Request a password reset</Button>}
      </div>
    </Card>
  )
}

function MyRequests({ requests }) {
  const qc = useQueryClient()
  const cancel = useMutation({
    mutationFn: authApi.cancelChangeRequest,
    onSuccess: () => {
      toast.success('Request cancelled')
      qc.invalidateQueries({ queryKey: KEY })
    },
    onError: (err) => toast.error(err.message),
  })
  return (
    <Card>
      <CardHeader title="My requests" />
      {requests.length ? (
        <ul className="divide-y divide-slate-100">
          {requests.map((r) => {
            const status = REQUEST_STATUS[r.status]
            return (
              <li key={r.id} className="flex flex-wrap items-start gap-3 px-5 py-3 text-sm">
                <div className="flex-1">
                  <p className="font-medium">
                    {REQUEST_TYPE[r.type]}{r.type === 'name_change' && <span className="font-normal text-slate-600"> → {r.firstName} {r.lastName}</span>}
                  </p>
                  <p className="text-slate-500">Requested {formatDateTime(r.createdAt)}{r.reviewedAt && ` · reviewed ${formatDateTime(r.reviewedAt)}`}</p>
                  {r.reviewNote && <p className="mt-1 text-slate-700">Administrator: “{r.reviewNote}”</p>}
                </div>
                <Badge tone={status.tone}>{status.label}</Badge>
                {r.status === 'pending' && (
                  <Button size="sm" variant="ghost" loading={cancel.isPending && cancel.variables === r.id} onClick={() => cancel.mutate(r.id)}>Cancel</Button>
                )}
              </li>
            )
          })}
        </ul>
      ) : <EmptyState title="No requests yet" />}
    </Card>
  )
}

/** Students change their PIN themselves: no approval, and other devices are signed out. */
function PinCard() {
  return (
    <Card>
      <CardHeader icon={KeyRound} title="Change PIN" subtitle="Your other devices will be signed out. Forgot it? Use “Forgot PIN” on the sign-in page." />
      <div className="max-w-md px-5 py-5">
        <ChangePinForm submitLabel="Change PIN" onChanged={() => toast.success('PIN changed. Your other devices have been signed out.')} />
      </div>
    </Card>
  )
}

/**
 * Name + password section of Profile/Account: direct for the super admin, request-and-approve for other
 * staff. Students change their PIN directly; only their name change needs approval.
 */
export default function AccountSecurity() {
  const { user } = useAuth()
  const requests = useRequests()
  if (!needsApproval(user)) {
    return (
      <>
        <NameForm />
        <PasswordForm />
      </>
    )
  }
  return (
    <QueryState query={requests}>
      {(rows) => {
        const pending = (type) => rows.find((r) => r.type === type && r.status === 'pending')
        return (
          <>
            <NameRequestForm pending={pending('name_change')} />
            {user.role?.name === ROLES.USER ? <PinCard /> : <PasswordRequestCard pending={pending('password_reset')} />}
            <MyRequests requests={rows} />
          </>
        )
      }}
    </QueryState>
  )
}
