import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react'
import { applicationsApi } from '../../api/applications'
import { Button, Input } from '../../components/ui'
import { applyServerErrors, newPinSchema } from '../../lib/forms'

const schema = z
  .object({ pin: newPinSchema, confirmPin: z.string() })
  .refine((d) => d.pin === d.confirmPin, { message: 'The PINs do not match', path: ['confirmPin'] })

const pinInput = { type: 'password', inputMode: 'numeric', maxLength: 6, autoComplete: 'off' }

/**
 * Landing page for the admission email's link: `${FRONTEND_URL}/activate?token=…`. The newly admitted
 * student chooses their PIN here; the link works once. Afterwards they sign in with Student ID + PIN.
 */
export default function Activate() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [done, setDone] = useState(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) })

  const onSubmit = async (values) => {
    try {
      setDone(await applicationsApi.activate({ token, ...values }))
    } catch (err) {
      if (err.status === 400 && /link/i.test(err.message)) setError('root', { message: err.message })
      else if (err.status === 400) setError('pin', { message: err.message })
      else applyServerErrors(err, setError, ['pin', 'confirmPin'])
    }
  }

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <XCircle className="size-10 text-red-500" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">This link is incomplete</h1>
        <p className="text-sm text-slate-500">Open the activation link from your admission email again, or ask the admissions office for a new one.</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-10 text-green-600" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Your student account is active</h1>
        <p className="text-sm text-slate-500">
          Sign in with your Student ID <span className="font-semibold text-slate-800">{done.studentNumber}</span> and the PIN you just chose.
          Your school email is <span className="font-medium text-slate-700">{done.schoolEmail}</span>.
        </p>
        <Link to="/login" state={{ mode: 'student' }} className="text-sm font-medium text-brand-600 hover:text-brand-700">Sign in</Link>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600"><ShieldCheck className="size-5" /></span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Activate your student account</h1>
      </div>
      <p className="mt-3 text-sm text-slate-500">Choose the 6-digit PIN you'll sign in with, together with your Student ID.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        {errors.root && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{errors.root.message}</p>}
        <Input label="PIN" autoFocus hint="6 digits. Avoid repeated digits, runs like 123456, and your Student ID." error={errors.pin?.message} {...pinInput} {...register('pin')} />
        <Input label="Confirm PIN" error={errors.confirmPin?.message} {...pinInput} {...register('confirmPin')} />
        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Activate account</Button>
      </form>
    </>
  )
}
