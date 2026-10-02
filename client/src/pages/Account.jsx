import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Badge, Card, CardHeader, PageHeader, Tabs } from '../components/ui'
import { Sessions } from '../components/account/Account'
import AccountSecurity from '../components/account/ChangeRequests'
import AvatarUploader from '../components/account/AvatarUploader'
import { ROLE_LABELS } from '../lib/roles'

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'security', label: 'Security' },
  { value: 'sessions', label: 'Sessions' },
]

/** Account settings for everyone: staff and lecturers' Profile/Settings, and the student Settings page. */
export default function Account() {
  const { user } = useAuth()
  // The tab lives in the URL so "Settings" links can open Security directly.
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'profile'
  const setTab = (value) => setParams(value === 'profile' ? {} : { tab: value }, { replace: true })
  return (
    <div className="space-y-6">
      <PageHeader title="Account" subtitle={`${user?.email} · ${ROLE_LABELS[user?.role?.name]}`} />
      <Tabs variant="underline" items={TABS} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <Card>
          <CardHeader title="Profile picture" subtitle="Shown in the header and on your profile." />
          <div className="px-5 py-4"><AvatarUploader required={user?.role?.name === 'STUDENT'} /></div>
        </Card>
      )}

      {tab === 'profile' && (
        <Card>
          <CardHeader title="Your account" />
          <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium">{user?.email}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Role</dt>
              <dd className="font-medium"><Badge tone="blue">{ROLE_LABELS[user?.role?.name]}</Badge></dd>
            </div>
            {user?.lecturer && (
              <>
                <div>
                  <dt className="text-slate-500">Department</dt>
                  <dd className="font-medium">{user.lecturer.title ?? ''} {user.lecturer.department?.name ?? ''}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Staff number</dt>
                  <dd className="font-medium">{user.lecturer.staffNumber}</dd>
                </div>
              </>
            )}
          </dl>
        </Card>
      )}

      {tab === 'security' && <AccountSecurity />}
      {tab === 'sessions' && <Sessions />}
    </div>
  )
}
