import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import ChangePinForm from '../../components/account/ChangePinForm'
import { homeForRole } from '../../lib/roles'

/** Shown after signing in with a temporary PIN (new admission or a staff reset): nothing else works until it's replaced. */
export default function ChangePin() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-600"><ShieldCheck className="size-5" /></span>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Welcome, {user?.firstName}!</h1>
      </div>
      <p className="mt-3 text-sm text-slate-500">For your security, please change your temporary PIN.</p>
      <div className="mt-6">
        <ChangePinForm onChanged={(u) => navigate(homeForRole(u.role?.name), { replace: true })} />
      </div>
      <p className="mt-6 text-center text-sm">
        <button type="button" onClick={() => logout().then(() => navigate('/login', { replace: true }))} className="font-medium text-brand-600 hover:text-brand-700">
          Sign out
        </button>
      </p>
    </>
  )
}
