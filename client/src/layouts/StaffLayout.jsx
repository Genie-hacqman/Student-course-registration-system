import AppShell from './AppShell'
import { useAuth } from '../auth/AuthProvider'
import { navForUser } from '../lib/nav'

/** Admins get the system-management menu, registrars the academic one; both filtered by permission. */
export default function StaffLayout() {
  const { user } = useAuth()
  return (
    <AppShell
      nav={navForUser(user)}
      home="/staff"
      notificationsPath="/staff/notifications"
      profilePath="/staff/account"
      settingsPath="/staff/account?tab=security"
    />
  )
}
