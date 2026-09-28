import AppShell from './AppShell'
import { STUDENT_NAV } from '../lib/nav'

export default function StudentLayout() {
  return (
    <AppShell nav={STUDENT_NAV} home="/student" notificationsPath="/student/notifications" profilePath="/student/profile" settingsPath="/student/settings" />
  )
}
