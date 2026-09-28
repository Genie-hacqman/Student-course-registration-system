import AppShell from './AppShell'
import { useAuth } from '../auth/AuthProvider'
import { LECTURER_NAV, visibleNav } from '../lib/nav'

export default function LecturerLayout() {
  const { user } = useAuth()
  return (
    <AppShell
      nav={visibleNav(LECTURER_NAV, user)}
      home="/lecturer"
      notificationsPath="/lecturer/notifications"
      profilePath="/lecturer/account"
      settingsPath="/lecturer/account?tab=security"
    />
  )
}
