import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Input, Tabs } from '../../components/ui'
import { applyServerErrors, emailSchema } from '../../lib/forms'
import { areaForRole, homeForRole } from '../../lib/roles'

const MODES = {
  student: {
    schema: z.object({
      identifier: z.string().trim().min(3, 'Enter your student ID'),
      password: z.string().min(1, 'Enter your PIN'),
    }),
    id: { label: 'Student ID', placeholder: 'e.g. STU202600123', autoComplete: 'username', autoCapitalize: 'characters' },
    secret: { label: 'PIN', inputMode: 'numeric', autoComplete: 'current-password' },
    forgot: { to: '/forgot-pin', label: 'Forgot PIN?' },
  },
  applicant: {
    schema: z.object({ identifier: emailSchema, password: z.string().min(1, 'Enter your password') }),
    id: { label: 'Personal email', type: 'email', autoComplete: 'email' },
    secret: { label: 'Password', autoComplete: 'current-password' },
    forgot: { to: '/forgot-password', label: 'Forgot password?' },
  },
  staff: {
    schema: z.object({ identifier: emailSchema, password: z.string().min(1, 'Enter your password') }),
    id: { label: 'Email', type: 'email', autoComplete: 'email' },
    secret: { label: 'Password', autoComplete: 'current-password' },
    forgot: { to: '/forgot-password', label: 'Forgot password?' },
  },
}

const MODE_KEY = 'scrs.loginMode'
const savedMode = () => {
  try {
    const saved = localStorage.getItem(MODE_KEY)
    return saved in MODES ? saved : 'student'
  } catch { return 'student' }
}

export default function Login() {
  const location = useLocation()
  const [mode, setMode] = useState(location.state?.mode ?? savedMode)

  const choose = (next) => {
    setMode(next)
    try { localStorage.setItem(MODE_KEY, next) } catch {}
  }

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h1>
      <Tabs
        className="mt-4"
        label="Sign in as"
        items={[{ value: 'student', label: 'Student' }, { value: 'applicant', label: 'Applicant' }, { value: 'staff', label: 'Staff' }]}
        value={mode}
        onChange={choose}
      />
      <LoginForm key={mode} mode={mode} />
      {mode === 'student' && (
        <p className="mt-6 text-center text-sm text-slate-500">
          Newly admitted? Activate your account with the link in your admission email first.
        </p>
      )}
      {mode !== 'staff' && (
        <div className="mt-6 hidden border-t border-slate-900/10 pt-5 text-center lg:block">
          <p className="text-sm font-medium text-slate-600">Want to study with us?</p>
          <Link
            to="/apply"
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-brand-800/30 bg-white px-4 py-2.5 text-sm font-semibold text-brand-600 shadow-sm transition hover:border-brand-800 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Apply for admission <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}
      {mode !== 'staff' && createPortal(
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/20 bg-slate-950/85 px-4 py-3 backdrop-blur-md lg:hidden">
          <Link
            to="/apply"
            className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            New here? Apply for admission <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>,
        document.body,
      )}
    </>
  )
}

function LoginForm({ mode }) {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const config = MODES[mode]
  const [locked, setLocked] = useState(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(config.schema) })

  const onSubmit = async (values) => {
    setLocked(null)
    try {
      const user = await login(values)
      if (user.mustChangePassword) return navigate('/change-pin', { replace: true })
      const role = user.role?.name
      const from = location.state?.from
      navigate(from?.startsWith(`/${areaForRole(role)}`) ? from : homeForRole(role), { replace: true })
    } catch (err) {
      if (err.code === 'ACCOUNT_LOCKED') setLocked(err.message)
      else if (err.status === 401) setError('password', { message: err.message })
      else applyServerErrors(err, setError)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
      <Input {...config.id} error={errors.identifier?.message} {...register('identifier')} />
      <Input type="password" {...config.secret} error={errors.password?.message} {...register('password')} />
      <div className="text-right text-sm">
        <Link to={config.forgot.to} className="font-medium text-brand-600 hover:text-brand-700">{config.forgot.label}</Link>
      </div>
      {locked && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {locked}
        </p>
      )}
      <Button type="submit" size="lg" loading={isSubmitting} className="w-full">Sign in</Button>
    </form>
  )
}
