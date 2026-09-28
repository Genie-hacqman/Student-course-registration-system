import { useAuth } from '../../auth/AuthProvider'
import { isAdminRole } from '../../lib/roles'
import AdminDashboard from './dashboards/AdminDashboard'
import RegistrarDashboard from './dashboards/RegistrarDashboard'

/** Admins monitor the whole system; registrars and advisors run registration. Same design system, different jobs. */
export default function StaffDashboard() {
  const { user } = useAuth()
  return isAdminRole(user?.role?.name) ? <AdminDashboard /> : <RegistrarDashboard />
}
