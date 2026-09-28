import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { areaForRole, can, homeForRole } from '../lib/roles'
import { FullPageSpinner } from '../components/ui'

/** Only for signed-in users whose role belongs to `area`; others are sent to their own home. */
export function RequireArea({ area }) {
  const { user, status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.mustChangePassword) return <Navigate to="/change-pin" replace />
  if (areaForRole(user.role?.name) !== area) return <Navigate to={homeForRole(user.role?.name)} replace />
  return <Outlet />
}

/** The change-PIN screen: only for a signed-in user whose PIN is still temporary. */
export function RequirePinChange() {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!user.mustChangePassword) return <Navigate to={homeForRole(user.role?.name)} replace />
  return <Outlet />
}

/** Inside an area: pages that need one specific permission. The server enforces it too. */
export function RequirePermission({ permission }) {
  const { user } = useAuth()
  if (!can(user, permission)) return <Navigate to={homeForRole(user?.role?.name)} replace />
  return <Outlet />
}

/** Login/register pages: a signed-in user goes straight to their home. */
export function GuestOnly() {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  if (user) return <Navigate to={homeForRole(user.role?.name)} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { user, status } = useAuth()
  if (status === 'loading') return <FullPageSpinner />
  return <Navigate to={user ? homeForRole(user.role?.name) : '/login'} replace />
}
