import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { authApi } from '../../api/auth'
import { useAuth } from '../../auth/AuthProvider'
import { Button, Loading } from '../../components/ui'
import { homeForRole } from '../../lib/roles'

/** Landing page for the emailed link: `${FRONTEND_URL}/verify-email?token=…`. Works signed in or out. */
export default function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { user, refreshUser } = useAuth()
  const [state, setState] = useState(token ? 'pending' : 'error')
  const [message, setMessage] = useState(token ? '' : 'This link is missing its token.')
  const sent = useRef(false)

  useEffect(() => {
    // The token works once, so StrictMode's double effect must not send it twice.
    if (!token || sent.current) return
    sent.current = true
    authApi.verifyEmail({ token })
      .then(async (data) => {
        setMessage(data.message)
        setState('done')
        if (user) await refreshUser().catch(() => {})
      })
      .catch((err) => {
        setMessage(err.message)
        setState('error')
      })
  }, [token, user, refreshUser])

  if (state === 'pending') return <Loading label="Confirming your email…" />
  const ok = state === 'done'
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {ok ? <CheckCircle2 className="size-10 text-green-600" /> : <XCircle className="size-10 text-red-500" />}
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">{ok ? 'Email confirmed' : 'Couldn’t confirm your email'}</h1>
      <p className="text-sm text-slate-500">{message}</p>
      {!ok && (user && !user.emailVerifiedAt
        ? <ResendVerification />
        : <p className="text-sm text-slate-500">Links work once and expire after 24 hours. Sign in and use “Resend link” to get a new one.</p>)}
      <Link to={user ? homeForRole(user.role?.name) : '/login'} className="text-sm font-medium text-brand-600 hover:text-brand-700">
        {user ? 'Continue' : 'Sign in'}
      </Link>
    </div>
  )
}

/** Signed in with an unverified email: send a fresh link right here (the API rate-limits it). */
function ResendVerification() {
  const [state, setState] = useState('idle')
  const [message, setMessage] = useState('')
  const send = () => {
    setState('sending')
    authApi.resendVerification()
      .then((data) => {
        setMessage(data?.message ?? 'A new link is on its way.')
        setState('sent')
      })
      .catch((err) => {
        setMessage(err.message)
        setState('failed')
      })
  }
  if (state === 'sent') return <p className="text-sm text-green-700">{message} Check your inbox (and spam folder).</p>
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" loading={state === 'sending'} onClick={send}>Send a new link</Button>
      {state === 'failed' && <p className="text-sm text-red-600">{message}</p>}
    </div>
  )
}
