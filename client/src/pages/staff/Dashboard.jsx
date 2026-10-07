import { useAuth } from '../../auth/AuthProvider'
import { isAdminRole } from '../../lib/roles'
import AdminDashboard from './dashboards/AdminDashboard'
import RegistrarDashboard from './dashboards/RegistrarDashboard'

export default function StaffDashboard() {
  const { user } = useAuth()
  return isAdminRole(user?.role?.name) ? <AdminDashboard /> : <RegistrarDashboard />
}
