import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { useForgotPassword } from '../../api/auth'
import { Button, Input } from '../../components/ui'
import { applyServerErrors, emailSchema } from '../../lib/forms'

export default function ForgotPassword() {
  const forgot = useForgotPassword()
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({ email: emailSchema })),
  })

  if (forgot.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-brand-600" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Request received</h1>
        <p className="text-sm text-slate-500">{forgot.data.message}</p>
        <Link to="/login" className="text-sm font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
      <p className="mt-1 text-sm text-slate-500">Staff: the administrator reviews password resets, and once approved we email you a link to choose a new password. Applicants: we email the link straight away.</p>
      <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
        Student? <Link to="/forgot-pin" className="font-medium text-brand-600 hover:text-brand-700">Reset your PIN instead</Link>
      </p>
      <form
        onSubmit={handleSubmit((v) => forgot.mutate(v, { onError: (err) => applyServerErrors(err, setError) }))}
        className="mt-6 space-y-4"
        noValidate
      >
        <Input label="Email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Button type="submit" loading={forgot.isPending} className="w-full">Request password reset</Button>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link to="/login" state={{ mode: 'staff' }} className="font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link>
      </p>
    </>
  )
}
