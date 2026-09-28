import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, MailCheck } from 'lucide-react'
import { useForgotPin, useResetPin } from '../../api/auth'
import { Button, Input } from '../../components/ui'
import { applyServerErrors, emailSchema, newPinSchema } from '../../lib/forms'

// The server sends at most one code a minute per student.
const RESEND_SECONDS = 60
const pinInput = { type: 'password', inputMode: 'numeric', maxLength: 6, autoComplete: 'off' }

/** Student ID + school email → emailed 6-digit code → new PIN. */
export default function ForgotPin() {
  const [sent, setSent] = useState(null) // { studentNumber, message, at }
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  if (done) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-10 text-green-600" />
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">PIN reset</h1>
        <p className="text-sm text-slate-500">Sign in with your student ID and your new PIN. You've been signed out on every device.</p>
        <Button onClick={() => navigate('/login', { replace: true, state: { mode: 'student' } })}>Sign in</Button>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reset your PIN</h1>
      {sent
        ? <ResetStep sent={sent} onBack={() => setSent(null)} onDone={() => setDone(true)} />
        : <RequestStep onSent={setSent} />}
      <p className="mt-6 text-center text-sm">
        <Link to="/login" state={{ mode: 'student' }} className="font-medium text-brand-600 hover:text-brand-700">Back to sign in</Link>
      </p>
    </>
  )
}

function RequestStep({ onSent }) {
  const forgot = useForgotPin()
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(z.object({ studentNumber: z.string().trim().min(3, 'Enter your student ID'), email: emailSchema })),
  })

  const onSubmit = (values) => forgot.mutate(values, {
    onSuccess: (data) => onSent({ studentNumber: values.studentNumber.toUpperCase(), message: data.message, at: Date.now() }),
    onError: (err) => applyServerErrors(err, setError),
  })

  return (
    <>
      <p className="mt-1 text-sm text-slate-500">We'll email a 6-digit code to your school email address.</p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input label="Student ID" placeholder="e.g. STU202600123" autoCapitalize="characters" autoComplete="username" error={errors.studentNumber?.message} {...register('studentNumber')} />
        <Input label="School email" type="email" placeholder="e.g. stu202600123@school.edu.gh" autoComplete="email" error={errors.email?.message} {...register('email')} />
        <Button type="submit" loading={forgot.isPending} className="w-full">Send code</Button>
      </form>
    </>
  )
}

const resetSchema = z
  .object({
    otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
    newPin: newPinSchema,
    confirmPin: z.string(),
  })
  .refine((d) => d.newPin === d.confirmPin, { message: 'The PINs do not match', path: ['confirmPin'] })

function ResetStep({ sent, onBack, onDone }) {
  const reset = useResetPin()
  const [wait, setWait] = useState(RESEND_SECONDS)
  const { register, handleSubmit, setError, formState: { errors } } = useForm({ resolver: zodResolver(resetSchema) })

  useEffect(() => {
    const tick = () => setWait(Math.max(0, RESEND_SECONDS - Math.floor((Date.now() - sent.at) / 1000)))
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [sent.at])

  const onSubmit = (values) => reset.mutate({ ...values, studentNumber: sent.studentNumber }, {
    onSuccess: onDone,
    onError: (err) => {
      if (err.status === 400) setError(/code/i.test(err.message) ? 'otp' : 'newPin', { message: err.message })
      else applyServerErrors(err, setError)
    },
  })

  return (
    <>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-50 p-3 text-sm text-brand-800">
        <MailCheck className="mt-0.5 size-4 shrink-0" /> {sent.message}
      </p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
        <Input label="Code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" autoFocus error={errors.otp?.message} {...register('otp')} />
        <Input label="New PIN" hint="6 digits. Avoid repeated digits, runs like 123456, and your student ID." error={errors.newPin?.message} {...pinInput} {...register('newPin')} />
        <Input label="Confirm PIN" error={errors.confirmPin?.message} {...pinInput} {...register('confirmPin')} />
        <Button type="submit" loading={reset.isPending} className="w-full">Reset PIN</Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        No code?{' '}
        {wait > 0
          ? <span>You can ask for a new one in {wait}s.</span>
          : <button type="button" onClick={onBack} className="font-medium text-brand-600 hover:text-brand-700">Send a new code</button>}
      </p>
    </>
  )
}
