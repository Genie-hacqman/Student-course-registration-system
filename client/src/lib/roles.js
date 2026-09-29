// The four roles (SCRS-backend src/utils/constants.js). Applicants are STUDENTs who aren't admitted yet.
export const ROLES = {
  ADMIN: 'ADMIN',
  REGISTRAR: 'REGISTRAR',
  LECTURER: 'LECTURER',
  STUDENT: 'STUDENT',
}

// Permission names from SCRS-backend src/utils/constants.js. The user's own list comes from /auth/me.
export const PERMS = {
  REGISTRATION_VIEW_ALL: 'registration:view_all',
  REGISTRATION_APPROVE: 'registration:approve',
  REPORT_VIEW: 'report:view',
  COURSE_MANAGE: 'course:manage',
  COURSE_CATALOG: 'course:catalog',
  LECTURER_ASSIGN: 'lecturer:assign',
  SEMESTER_MANAGE: 'semester:manage',
  SECTION_MANAGE: 'section:manage',
  PREREQ_OVERRIDE: 'prerequisite:override',
  USER_MANAGE: 'user:manage',
  AUDIT_VIEW: 'audit:view',
  SETTINGS_MANAGE: 'settings:manage',
  GRADE_MANAGE: 'grade:manage',
  ROSTER_VIEW: 'roster:view',
  REGISTRATION_MANAGE: 'registration:manage',
  ACCOUNT_APPROVE: 'account:approve',
  GRADE_ENTER: 'grade:enter',
  ATTENDANCE_RECORD: 'attendance:record',
  ASSESSMENT_MANAGE: 'assessment:manage',
  ANNOUNCEMENT_CREATE: 'announcement:create',
  ROLE_MANAGE: 'role:manage',
  STUDENT_ADMIT: 'student:admit',
  APPLICATION_SELF: 'application:self',
  APPLICATION_REVIEW: 'application:review',
}

/** The "Import data" screen: any one of these unlocks the import steps that permission covers. */
export const DATA_IMPORT_PERMS = [PERMS.COURSE_MANAGE, PERMS.COURSE_CATALOG, PERMS.USER_MANAGE, PERMS.STUDENT_ADMIT, PERMS.SECTION_MANAGE]

/** `permission` may be a list, meaning any one of them. */
export const can = (user, permission) => (Array.isArray(permission)
  ? permission.some((p) => can(user, p))
  : Boolean(user?.permissions?.includes(permission)))

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  REGISTRAR: 'Registrar',
  LECTURER: 'Lecturer',
  STUDENT: 'Student',
}

/** A STUDENT's admission state comes from /auth/me (`admissionStatus`), never from the role. */
export const isAdmitted = (user) => user?.role?.name === ROLES.STUDENT && user?.admissionStatus === 'ADMITTED'

/** Which app area a role lands in. Staff screens are gated by permission inside the staff area. */
export const areaForRole = (role) => {
  if (role === ROLES.STUDENT) return 'student'
  if (role === ROLES.LECTURER) return 'lecturer'
  return 'staff'
}

/**
 * Admins, and students still applying (their own personal email), change their password or name
 * directly; registrars, lecturers and admitted students' name changes go to an admin for approval.
 */
export const needsApproval = (user) => {
  const role = user?.role?.name
  if (role === ROLES.ADMIN) return false
  if (role === ROLES.STUDENT && !isAdmitted(user)) return false
  return true
}

/** Admins and registrars share the staff area but get different dashboards and menus. */
export const isAdminRole = (role) => role === ROLES.ADMIN

export const homeForRole = (role) => `/${areaForRole(role)}`
