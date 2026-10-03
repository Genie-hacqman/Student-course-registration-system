import { Link } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { Avatar, Badge, Button, Card, CardHeader, PageHeader, StatusBadge } from '../../components/ui'
import AvatarUploader from '../../components/account/AvatarUploader'
import { fullName } from '../../lib/format'

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{value ?? '—'}</dd>
    </div>
  )
}

export default function Profile() {
  const { user } = useAuth()
  const s = user?.student

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        subtitle="Your programme and level are managed by the registry."
        action={<Link to="/student/settings"><Button variant="secondary"><KeyRound className="size-4" aria-hidden /> Settings & security</Button></Link>}
      />
      <Card className="flex items-center gap-4 p-5">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <p className="text-lg font-semibold">{fullName(user)}</p>
          <p className="text-sm text-slate-500">{s?.studentNumber} · {s?.program?.name}</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Profile picture" subtitle="Your portal picture. Changing or removing it does not affect the official photo on your admission application." />
        <div className="px-5 py-4"><AvatarUploader /></div>
      </Card>
      <Card>
        <CardHeader title="Student record" />
        <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Student ID" value={s?.studentNumber} />
          <Field label="School email" value={<>{user?.email} {user?.emailVerifiedAt ? <Badge tone="green">verified</Badge> : <Badge tone="amber">not verified</Badge>}</>} />
          <Field label="Programme" value={s?.program?.name} />
          <Field label="Department" value={s?.program?.department?.name} />
          <Field label="Level" value={s?.level} />
          {/* Every student record comes from an admission (online application or staff admission). */}
          <Field label="Admission status" value={s && <Badge tone="green">Admitted</Badge>} />
          <Field label="Status" value={s?.status && <StatusBadge status={s.status === 'active' ? 'active' : s.status === 'suspended' ? 'suspended' : undefined} label={s.status[0].toUpperCase() + s.status.slice(1)} />} />
          <Field label="Admitted" value={s?.admissionYear} />
        </dl>
      </Card>
    </div>
  )
}
