import AppShell from './AppShell'
import { APPLICANT_NAV } from '../lib/nav'

/** Prospective students, before admission: their application and account settings only. */
export default function ApplicantLayout() {
  return (
    <AppShell nav={APPLICANT_NAV} home="/applicant" notificationsPath="/applicant" profilePath="/applicant/settings" settingsPath="/applicant/settings?tab=security" />
  )
}
