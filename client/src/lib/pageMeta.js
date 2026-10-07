export const SITE_NAME = 'UniReg'

const PUBLIC_ROUTES = [
  ['/', 'Sign in', 'Sign in to UniReg, the Student Course Registration System: register for courses, track approvals and view your timetable and results.'],
  ['/login', 'Sign in', 'Sign in to UniReg, the Student Course Registration System: register for courses, track approvals and view your timetable and results.'],
  ['/apply', 'Apply for admission', 'Apply for admission online. Create an account, complete your application and track the decision in UniReg.'],
  ['/privacy', 'Privacy policy', 'How UniReg collects, uses and protects your personal information, including the single essential cookie it sets.'],
  ['/terms', 'Terms and conditions', 'The terms that apply when you use UniReg, the Student Course Registration System.'],
]

const PRIVATE_ROUTES = [
  ['/forgot-password', 'Reset your password'],
  ['/forgot-pin', 'Reset your PIN'],
  ['/reset-password', 'Choose a new password'],
  ['/verify-email', 'Verify your email'],
  ['/activate-account', 'Activate your account'],
  ['/activate', 'Activate your account'],
  ['/change-pin', 'Change your PIN'],

  ['/student', 'Student overview'],
  ['/student/admission', 'Admission status'],
  ['/student/courses', 'Available courses'],
  ['/student/courses/:id', 'Course details'],
  ['/student/registration', 'Course registration'],
  ['/student/my-courses', 'Registration and slip'],
  ['/student/timetable', 'Timetable'],
  ['/student/calendar', 'Academic calendar'],
  ['/student/history', 'Registration history'],
  ['/student/results', 'Results'],
  ['/student/announcements', 'Announcements'],
  ['/student/notifications', 'Notifications'],
  ['/student/profile', 'Profile'],
  ['/student/settings', 'Account settings'],

  ['/lecturer', 'Lecturer dashboard'],
  ['/lecturer/courses', 'My courses'],
  ['/lecturer/courses/:id', 'Course hub'],
  ['/lecturer/students', 'My students'],
  ['/lecturer/attendance', 'Attendance'],
  ['/lecturer/assessments', 'Assessments'],
  ['/lecturer/results', 'Results'],
  ['/lecturer/timetable', 'Lecturer timetable'],
  ['/lecturer/announcements', 'Announcements'],
  ['/lecturer/notifications', 'Notifications'],
  ['/lecturer/account', 'Account'],

  ['/staff', 'Staff dashboard'],
  ['/staff/registrations', 'Registrations'],
  ['/staff/registrations/:id', 'Registration review'],
  ['/staff/timetable-issues', 'Timetable issues'],
  ['/staff/applications', 'Applications'],
  ['/staff/applications/:id', 'Application review'],
  ['/staff/reports', 'Reports'],
  ['/staff/departments', 'Departments'],
  ['/staff/departments/:id', 'Department'],
  ['/staff/programs', 'Programmes'],
  ['/staff/programs/:id', 'Programme'],
  ['/staff/courses', 'Courses'],
  ['/staff/courses/import', 'Import courses'],
  ['/staff/courses/:id', 'Course'],
  ['/staff/lecturers', 'Lecturers'],
  ['/staff/lecturers/:id', 'Lecturer'],
  ['/staff/course-assignments', 'Course assignments'],
  ['/staff/semesters', 'Semesters'],
  ['/staff/semesters/:id', 'Semester'],
  ['/staff/sections', 'Course offerings'],
  ['/staff/sections/:id', 'Course offering'],
  ['/staff/sections/:id/class', 'Class list'],
  ['/staff/students', 'Students'],
  ['/staff/students/departments/:departmentId', 'Students by department'],
  ['/staff/students/programs/:programId', 'Programme students'],
  ['/staff/students/:id', 'Student record'],
  ['/staff/users', 'All users'],
  ['/staff/users/:id', 'User'],
  ['/staff/administrators', 'Administrators and registrars'],
  ['/staff/audit-log', 'Audit log'],
  ['/staff/sign-ins', 'Sign-in history'],
  ['/staff/email-log', 'Email log'],
  ['/staff/account-requests', 'Account requests'],
  ['/staff/settings', 'System settings'],
  ['/staff/results-import', 'Import results'],
  ['/staff/data-import', 'Import data'],
  ['/staff/roles', 'Roles and permissions'],
  ['/staff/announcements', 'Announcements'],
  ['/staff/notifications', 'Notifications'],
  ['/staff/account', 'Account'],
]

const NOT_FOUND = {
  title: 'Page not found',
  description: 'This page does not exist. Return to UniReg, the Student Course Registration System.',
  noindex: true,
}

const AREA_NAMES = { student: 'Student', lecturer: 'Lecturer', staff: 'Staff' }

function matches(pattern, segments) {
  const parts = pattern.split('/').filter(Boolean)
  return parts.length === segments.length && parts.every((p, i) => p.startsWith(':') || p === segments[i])
}

function specificity(pattern) {
  return pattern.split('/').filter((p) => p && !p.startsWith(':')).length
}

function find(routes, segments) {
  return routes
    .filter(([pattern]) => matches(pattern, segments))
    .sort((a, b) => specificity(b[0]) - specificity(a[0]))[0]
}

export function titleFor(label) {
  return `${label} · ${SITE_NAME}`
}

export function metaFor(pathname) {
  const segments = pathname.split('/').filter(Boolean)

  const pub = find(PUBLIC_ROUTES, segments)
  if (pub) return { title: titleFor(pub[1]), description: pub[2], noindex: false }

  const priv = find(PRIVATE_ROUTES, segments)
  if (priv) {
    const area = AREA_NAMES[segments[0]]
    const label = area ? `${priv[1]} · ${area} portal` : priv[1]
    const where = area ? `the ${SITE_NAME} ${area.toLowerCase()} portal` : SITE_NAME
    return { title: titleFor(label), description: `${priv[1]} in ${where}. Sign in to continue.`, noindex: true }
  }

  return { ...NOT_FOUND, title: titleFor(NOT_FOUND.title) }
}

export const ALL_ROUTE_PATTERNS = [...PUBLIC_ROUTES, ...PRIVATE_ROUTES].map(([pattern]) => pattern)
