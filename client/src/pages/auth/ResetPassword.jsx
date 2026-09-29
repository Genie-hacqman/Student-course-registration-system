import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useResetPassword } from '../../api/auth'
import { Button, Input } from '../../components/ui'
import { applyServerErrors, passwordSchema } from '../../lib/forms'

const schema = z.object({ password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] })

/** Landing page for the emailed link: `${FRONTEND_URL}/reset-password?token=…`. */
export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const reset = useResetPassword()
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ resolver: zodResolver(schema) })
  const [linkProblem, setLinkProblem] = useState(null)

  if (linkProblem) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">This link can't be used</h1>
        <p className="text-sm text-slate-500">{linkProblem} Reset links work once and expire after a short time.</p>
        <Link to="/forgot-password" className="text-sm font-medium text-brand-600">Request a new link</Link>
      </div>
    )
  }

  if (!token) {
    return (
      <div className="space-y-3 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Invalid reset link</h1>
        <p className="text-sm text-slate-500">This link is missing its token. Request a new one.</p>
        <Link to="/forgot-password" className="text-sm font-medium text-brand-600">Request a new link</Link>
      </div>
    )
  }

  const onSubmit = ({ password }) => reset.mutate({ token, password }, {
    onSuccess: (data) => {
      toast.success(data.message)
      navigate('/login', { replace: true })
    },
    // An expired or already-used link can't be fixed by retyping the password: say so and offer a new one.
    onError: (err) => (err.status === 400 && /token/i.test(err.message) ? setLinkProblem('It has expired or was already used.') : applyServerErrors(err, setError)),
  })

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Choose a new password</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input label="New password" type="password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        <Button type="submit" size="lg" loading={reset.isPending} className="w-full">Reset password</Button>
      </form>
    </>
  )
}
