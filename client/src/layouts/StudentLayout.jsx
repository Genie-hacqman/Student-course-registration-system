import AppShell from './AppShell'
import { useAuth } from '../auth/AuthProvider'
import { STUDENT_APPLYING_NAV, STUDENT_NAV } from '../lib/nav'
import { isAdmitted } from '../lib/roles'

export default function StudentLayout() {
  const { user } = useAuth()
  const admitted = isAdmitted(user)
  return (
    <AppShell
      nav={admitted ? STUDENT_NAV : STUDENT_APPLYING_NAV}
      home={admitted ? '/student' : '/student/admission'}
      notificationsPath="/student/notifications"
      profilePath={admitted ? '/student/profile' : '/student/settings'}
      settingsPath="/student/settings"
    />
  )
}
