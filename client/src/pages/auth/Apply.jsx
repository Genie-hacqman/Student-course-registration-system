import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { applicationsApi } from '../../api/applications'
import { Button, Input } from '../../components/ui'
import { applyServerErrors, emailSchema, passwordSchema } from '../../lib/forms'

const schema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter your first name').max(100),
    lastName: z.string().trim().min(1, 'Enter your last name').max(100),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'The passwords do not match', path: ['confirmPassword'] })

/**
 * Prospective students create an applicant account with their personal email. The server answers the
 * same whether or not the email is taken, so after signing up we simply try to sign in: that works for a
 * new account, and otherwise the person is pointed to sign in or reset their password.
 */
export default function Apply() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [existing, setExisting] = useState(false)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async ({ confirmPassword: _confirm, ...values }) => {
    try {
      await applicationsApi.signUp(values)
      try {
        await login({ identifier: values.email, password: values.password })
        navigate('/applicant', { replace: true })
      } catch {
        setExisting(true)
      }
    } catch (err) {
      applyServerErrors(err, setError, ['firstName', 'lastName', 'email', 'password'])
    }
  }

  if (existing) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <MailCheck className="size-10 text-brand-600" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Check your email</h1>
        <p className="text-sm text-slate-500">
          If this email address can be used, your account is ready. If you already have an account, sign in or reset your password.
        </p>
        <Link to="/login" state={{ mode: 'applicant' }} className="text-sm font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Apply for admission</h1>
      <p className="mt-2 text-sm text-slate-500">
        Create an account with your personal email. You'll fill in your application next, and we'll send the admission decision to this address.
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
          <Input label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <Input label="Personal email" type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Input
          label="Password" type="password" autoComplete="new-password"
          hint="At least 8 characters, with upper and lower case letters and a number."
          error={errors.password?.message} {...register('password')}
        />
        <Input label="Confirm password" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Create account</Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already applied? <Link to="/login" state={{ mode: 'applicant' }} className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
      </p>
    </>
  )
}
