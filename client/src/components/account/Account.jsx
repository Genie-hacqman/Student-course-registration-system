import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Laptop, MailWarning, Smartphone } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { authApi, useChangePassword } from '../../api/auth'
import { Badge, Button, Card, CardHeader, Input, QueryState } from '../ui'
import ConfirmDialog from '../admin/ConfirmDialog'
import { applyServerErrors, passwordSchema } from '../../lib/forms'
import { describeDevice, formatDateTime } from '../../lib/format'

const nameSchema = z.object({
  firstName: z.string().trim().min(1, 'Required').max(100),
  lastName: z.string().trim().min(1, 'Required').max(100),
})

export function NameForm() {
  const { user, refreshUser } = useAuth()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty }, reset } = useForm({
    resolver: zodResolver(nameSchema),
    defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' },
  })
  const onSubmit = async (values) => {
    try {
      await authApi.updateProfile(values)
      await refreshUser()
      reset(values)
      toast.success('Your name was updated')
    } catch (err) {
      applyServerErrors(err, setError, ['firstName', 'lastName'])
    }
  }
  return (
    <Card>
      <CardHeader title="Your name" subtitle="Shown to staff and on your registration slip. Contact the registry to change your email address." />
      <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-xl gap-4 px-5 py-5 sm:grid-cols-2" noValidate>
        <Input label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
        <Input label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
        <div><Button type="submit" loading={isSubmitting} disabled={!isDirty}>Save name</Button></div>
      </form>
    </Card>
  )
}

const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
  confirmPassword: z.string(),
})
  .refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })
  .refine((d) => d.currentPassword !== d.newPassword, { message: 'New password must differ from the current password', path: ['newPassword'] })

export function PasswordForm() {
  const { endSession } = useAuth()
  const navigate = useNavigate()
  const change = useChangePassword()
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm({ resolver: zodResolver(passwordFormSchema) })

  // The server ends every session on a password change, so the user signs in again.
  const onSubmit = ({ currentPassword, newPassword }) => change.mutate({ currentPassword, newPassword }, {
    onSuccess: (data) => {
      reset()
      toast.success(data.message)
      endSession()
      navigate('/login', { replace: true })
    },
    onError: (err) => {
      if (err.status === 400) setError('currentPassword', { message: err.message })
      else applyServerErrors(err, setError)
    },
  })

  return (
    <Card>
      <CardHeader title="Change password" subtitle="You'll be signed out on every device and asked to sign in again." />
      <form onSubmit={handleSubmit(onSubmit)} className="grid max-w-md gap-4 px-5 py-5" noValidate>
        <Input label="Current password" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
        <Input label="New password" type="password" autoComplete="new-password" error={errors.newPassword?.message} {...register('newPassword')} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        <div><Button type="submit" loading={change.isPending}>Update password</Button></div>
      </form>
    </Card>
  )
}

export function Sessions() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: authApi.sessions })
  const end = useMutation({
    mutationFn: authApi.endSession,
    onSuccess: () => {
      toast.success('That device has been signed out')
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (err) => toast.error(err.message),
  })
  const [confirmingAll, setConfirmingAll] = useState(false)

  const signOutEverywhere = async () => {
    await logout({ everywhere: true })
    toast.success('Signed out on all devices')
    navigate('/login', { replace: true })
  }

  return (
    <Card>
      <CardHeader
        title="Where you're signed in"
        subtitle="Sign out a device you don't recognise or no longer use."
        action={<Button variant="secondary" size="sm" onClick={() => setConfirmingAll(true)}>Sign out everywhere</Button>}
      />
      <QueryState query={sessions}>
        {(rows) => (
          <ul className="divide-y divide-slate-100">
            {rows.map((s) => {
              const device = describeDevice(s.userAgent)
              const Icon = device.mobile ? Smartphone : Laptop
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-3">
                  <Icon className="size-5 shrink-0 text-slate-400" />
                  <div className="flex-1 text-sm">
                    <p className="font-medium">{device.label} {s.current && <Badge tone="green">This device</Badge>}</p>
                    <p className="text-slate-500">{s.ipAddress ?? 'Unknown location'} · last active {formatDateTime(s.lastActiveAt)}</p>
                  </div>
                  {!s.current && (
                    <Button size="sm" variant="ghost" className="text-red-600" loading={end.isPending && end.variables === s.id} onClick={() => end.mutate(s.id)}>
                      Sign out
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </QueryState>
      <ConfirmDialog
        open={confirmingAll}
        onClose={() => setConfirmingAll(false)}
        title="Sign out everywhere?"
        confirmLabel="Sign out everywhere"
        onConfirm={signOutEverywhere}
      >
        <p>Every device, including this one, will be signed out and need to sign in again.</p>
      </ConfirmDialog>
    </Card>
  )
}

/** Shown in the app shell until the user confirms their email address. */
export function VerifyEmailBanner() {
  const { user } = useAuth()
  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: (data) => toast.success(data.message),
    onError: (err) => toast.error(err.message),
  })
  if (!user || user.emailVerifiedAt) return null
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
      <MailWarning className="size-4 shrink-0" />
      <span className="flex-1">Please confirm your email address — we sent a link to <span className="font-medium">{user.email}</span>.</span>
      <Button size="sm" variant="secondary" loading={resend.isPending} disabled={resend.isSuccess} onClick={() => resend.mutate()}>
        {resend.isSuccess ? 'Link sent' : 'Resend link'}
      </Button>
    </div>
  )
}
