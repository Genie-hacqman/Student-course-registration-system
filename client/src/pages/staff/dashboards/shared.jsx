import { ClipboardCheck, UserCheck } from 'lucide-react'
import { useApi } from '../../../api/admin'
import { useRegistrations } from '../../../api/staff'
import { PERMS, can } from '../../../lib/roles'

export const describeAction = (action, label) =>
  label ?? action.split('.').map((w) => w.replace(/[-_]/g, ' ')).join(' ').replace(/^./, (c) => c.toUpperCase())

export function usePendingActions(user, semesterId) {
  const canReview = can(user, PERMS.REGISTRATION_VIEW_ALL)
  const canApproveAccounts = can(user, PERMS.ACCOUNT_APPROVE)
  const registrations = useRegistrations({ status: canReview ? 'submitted' : undefined, semesterId: canReview ? semesterId : undefined, limit: 1 })
  const accounts = useApi(canApproveAccounts ? '/admin/account-requests' : null, { status: 'pending', limit: 1 })
  const items = [
    canReview && {
      key: 'registrations', label: 'Registrations awaiting approval', icon: ClipboardCheck,
      count: registrations.data?.meta.total, to: `/staff/registrations?status=submitted${semesterId ? `&semester=${semesterId}` : ''}`,
    },
    canApproveAccounts && {
      key: 'accounts', label: 'Password & name change requests', icon: UserCheck,
      count: accounts.data?.meta?.total, to: '/staff/account-requests',
    },
  ].filter(Boolean)
  const known = items.every((i) => i.count !== undefined)
  return { items, total: known ? items.reduce((n, i) => n + i.count, 0) : undefined }
}

export const REG_TONES = {
  approved: '#16a34a', submitted: '#f59e0b', rejected: '#dc2626', draft: '#94a3b8', notStarted: '#cbd5e1',
}

export const registrationSlices = (reg) => [
  { label: 'Registered', value: reg.byStatus.approved, color: REG_TONES.approved },
  { label: 'Pending approval', value: reg.byStatus.submitted, color: REG_TONES.submitted },
  { label: 'Needs changes', value: reg.byStatus.rejected, color: REG_TONES.rejected },
  { label: 'In progress (draft)', value: reg.byStatus.draft, color: REG_TONES.draft },
  { label: 'Not started', value: reg.notStarted, color: REG_TONES.notStarted },
]

export const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
