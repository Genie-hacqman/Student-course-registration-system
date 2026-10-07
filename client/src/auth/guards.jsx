import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { areaForRole, can, homeForRole, isAdmitted } from '../lib/roles'
import { FullPageSpinner } from '../components/ui'

export function RequireArea({ area }) {
  const { user, status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.mustChangePassword) return <Navigate to="/change-pin" replace />
  if (areaForRole(user.role?.name) !== area) return <Navigate to={homeForRole(user.role?.name)} replace />
  if (area === 'student' && !isAdmitted(user) && !APPLYING_PATHS.some((p) => location.pathname.startsWith(p))) {
    return <Navigate to="/student/admission" replace />
  }
  return <Outlet />
}

const APPLYING_PATHS = ['/student/admission', '/student/settings', '/student/notifications']

export function RequirePinChange() {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!user.mustChangePassword) return <Navigate to={homeForRole(user.role?.name)} replace />
  return <Outlet />
}

export function RequirePermission({ permission }) {
  const { user } = useAuth()
  if (!can(user, permission)) return <Navigate to={homeForRole(user?.role?.name)} replace />
  return <Outlet />
}

export function GuestOnly() {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (user) return <Navigate to={homeForRole(user.role?.name)} replace />
  return <Outlet />
}

const landingFor = (user) => (user.role?.name === 'STUDENT' && !isAdmitted(user) ? '/student/admission' : homeForRole(user.role?.name))

export function HomeRedirect() {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  return <Navigate to={user ? landingFor(user) : '/login'} replace />
}
