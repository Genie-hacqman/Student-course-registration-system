export const DAY_NAMES = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}
export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export const formatTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`
}

export const minutesOf = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const formatDateTime = (d) =>
  d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—')

export const timeAgo = (d) => {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return formatDate(d)
}

export const lecturerName = (lecturer) =>
  lecturer ? [lecturer.title, lecturer.user?.firstName, lecturer.user?.lastName].filter(Boolean).join(' ') : 'To be assigned'

export const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ')

export const initials = (user) => [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?'

export const windowState = (semester, registration) => {
  if (!semester) return { label: 'No active semester', tone: 'slate' }
  if (semester.registrationOpen) return { label: 'Open', tone: 'green' }
  const opensAt = new Date(semester.myRegistrationOpensAt)
  if (opensAt > new Date()) return { label: `Opens ${formatDateTime(opensAt)}`, tone: 'amber' }
  if (semester.addDropOpen && registration?.submittedAt) return { label: 'Add/drop open', tone: 'green' }
  return { label: 'Closed', tone: 'red' }
}

export const REGISTRATION_STATUS = {
  draft: { label: 'Draft', tone: 'slate' },
  submitted: { label: 'Awaiting approval', tone: 'amber' },
  approved: { label: 'Approved', tone: 'green' },
  rejected: { label: 'Needs changes', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'slate' },
}

export const SECTION_STATUS = {
  eligible: { label: 'Available', tone: 'green' },
  registered: { label: 'Registered', tone: 'blue' },
  full: { label: 'Full', tone: 'amber' },
  blocked: { label: 'Not eligible', tone: 'red' },
}

export const describeDevice = (ua) => {
  if (!ua) return { label: 'Unknown device', mobile: false }
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'unknown system'
  return { label: `${browser} on ${os}`, mobile: /iPhone|Android|Mobile/.test(ua) }
}


export const APPLICATION_STATUS = {
  draft: ['slate', 'Draft'],
  submitted: ['amber', 'Under review'],
  admitted: ['green', 'Admitted'],
  rejected: ['red', 'Not admitted'],
}
