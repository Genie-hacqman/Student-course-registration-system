import { useMemo, useState } from 'react'
import { Lock, RotateCcw, ShieldCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../auth/AuthProvider'
import { usePermissionCatalog, useRoles, useSetRolePermissions } from '../../api/roles'
import { Badge, Button, Card, CardHeader, ErrorState, PageHeader, Skeleton, SkeletonList, cx } from '../../components/ui'
import ConfirmDialog from '../../components/admin/ConfirmDialog'
import { ROLE_LABELS } from '../../lib/roles'

// Mirrors NON_GRANTABLE_PERMISSIONS in SCRS-backend src/utils/constants.js; the API refuses them anyway.
const NON_GRANTABLE = ['role:manage', 'registration:self']

function PermissionMatrix({ role, catalog, isOwnRole }) {
  const save = useSetRolePermissions()
  const [draft, setDraft] = useState(() => new Set(role.permissions))
  const [confirming, setConfirming] = useState(false)
  const current = useMemo(() => new Set(role.permissions), [role.permissions])
  const defaults = useMemo(() => new Set(role.defaults), [role.defaults])
  const editable = role.editable && !isOwnRole

  const added = [...draft].filter((p) => !current.has(p))
  const removed = [...current].filter((p) => !draft.has(p))
  const dirty = added.length + removed.length > 0
  const isDefault = draft.size === defaults.size && [...draft].every((p) => defaults.has(p))
  const groups = catalog.reduce((map, p) => map.set(p.group, [...(map.get(p.group) ?? []), p]), new Map())
  const describe = (name) => catalog.find((p) => p.name === name)?.description ?? name

  const toggle = (name) => setDraft((d) => {
    const next = new Set(d)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    return next
  })

  return (
    <Card>
      <CardHeader
        title={ROLE_LABELS[role.name] ?? role.name}
        subtitle={role.description}
        icon={ShieldCheck}
        action={editable && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={isDefault} onClick={() => setDraft(new Set(defaults))}><RotateCcw className="size-4" aria-hidden /> Defaults</Button>
            <Button size="sm" disabled={!dirty} onClick={() => setConfirming(true)}>Save changes</Button>
          </div>
        )}
      />
      {!editable && (
        <p className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-sm text-slate-600">
          <Lock className="size-4 text-slate-400" aria-hidden />
          {isOwnRole ? 'You can’t change the permissions of your own role.' : 'This role’s permissions are fixed.'}
        </p>
      )}
      <div className="divide-y divide-slate-100">
        {[...groups].map(([group, perms]) => (
          <fieldset key={group} className="px-5 py-4">
            <legend className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">{group}</legend>
            <ul className="grid gap-1 md:grid-cols-2">
              {perms.map((p) => {
                const locked = !editable || NON_GRANTABLE.includes(p.name)
                const changed = draft.has(p.name) !== defaults.has(p.name)
                return (
                  <li key={p.name}>
                    <label className={cx('flex items-start gap-3 rounded-lg p-2.5 transition', locked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-slate-50')}>
                      <input
                        type="checkbox"
                        checked={draft.has(p.name)}
                        disabled={locked}
                        onChange={() => toggle(p.name)}
                        className="mt-0.5 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-800">{p.description}</span>
                        <span className="block font-mono text-xs text-slate-400">{p.name}</span>
                      </span>
                      {changed && <Badge tone="amber">Changed from default</Badge>}
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>
        ))}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Update ${ROLE_LABELS[role.name] ?? role.name} permissions?`}
        confirmLabel="Save changes"
        danger={removed.length > 0}
        onConfirm={async () => {
          await save.mutateAsync({ id: role.id, permissions: [...draft] })
          toast.success('Permissions updated', { description: `Applies to all ${role.userCount} ${role.userCount === 1 ? 'user' : 'users'} with this role right away.` })
        }}
      >
        {added.length > 0 && (
          <div>
            <p className="font-medium text-green-800">Granted</p>
            <ul className="mt-1 list-disc pl-5">{added.map((p) => <li key={p}>{describe(p)}</li>)}</ul>
          </div>
        )}
        {removed.length > 0 && (
          <div>
            <p className="font-medium text-red-800">Removed</p>
            <ul className="mt-1 list-disc pl-5">{removed.map((p) => <li key={p}>{describe(p)}</li>)}</ul>
          </div>
        )}
        <p>This affects {role.userCount} {role.userCount === 1 ? 'user' : 'users'}. The server enforces it immediately; their menus update the next time they load the app.</p>
      </ConfirmDialog>
    </Card>
  )
}

export default function RolesPermissions() {
  const { user } = useAuth()
  const roles = useRoles()
  const catalog = usePermissionCatalog()
  const [selectedId, setSelectedId] = useState(null)

  const failed = roles.isError ? roles : catalog.isError ? catalog : null
  const list = roles.data ?? []
  const selected = list.find((r) => r.id === selectedId) ?? list.find((r) => r.editable) ?? list[0]

  return (
    <div className="space-y-6">
      <PageHeader title="Roles & Permissions" subtitle="Adjust what registrars and lecturers can do. Admin and Student access is fixed." />
      {failed ? <Card><ErrorState error={failed.error} onRetry={() => failed.refetch()} /></Card> : (
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="self-start">
            <CardHeader title="Roles" />
            {roles.isPending ? <SkeletonList rows={6} /> : (
              <ul className="p-2" role="listbox" aria-label="Roles">
                {list.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected?.id === r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition', selected?.id === r.id ? 'bg-brand-50 text-brand-800' : 'hover:bg-slate-50')}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{ROLE_LABELS[r.name] ?? r.name}</span>
                        <span className="flex items-center gap-1 text-xs text-slate-500"><Users className="size-3" aria-hidden /> {r.userCount} · {r.permissions.length} permissions</span>
                      </span>
                      {!r.editable && <Lock className="size-3.5 text-slate-400" aria-label="Fixed" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {roles.isPending || catalog.isPending || !selected
            ? <Card className="space-y-3 p-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</Card>
            : <PermissionMatrix key={`${selected.id}:${selected.permissions.join()}`} role={selected} catalog={catalog.data} isOwnRole={selected.name === user?.role?.name} />}
        </div>
      )}
    </div>
  )
}
