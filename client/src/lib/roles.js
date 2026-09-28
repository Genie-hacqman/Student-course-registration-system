export const ROLES = {
  USER: 'USER',
  LECTURER: 'LECTURER',
  ACADEMIC_ADVISOR: 'ACADEMIC_ADVISOR',
  REGISTRAR: 'REGISTRAR',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  APPLICANT: 'APPLICANT',
}

// Permission names from SCRS-backend src/utils/constants.js. The user's own list comes from /auth/me.
export const PERMS = {
  REGISTRATION_VIEW_ALL: 'registration:view_all',
  REGISTRATION_APPROVE: 'registration:approve',
  REPORT_VIEW: 'report:view',
  COURSE_MANAGE: 'course:manage',
  COURSE_CATALOG: 'course:catalog',
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
export const DATA_IMPORT_PERMS = [PERMS.COURSE_MANAGE, PERMS.USER_MANAGE, PERMS.STUDENT_ADMIT, PERMS.SECTION_MANAGE]

/** `permission` may be a list, meaning any one of them. */
export const can = (user, permission) => (Array.isArray(permission)
  ? permission.some((p) => can(user, p))
  : Boolean(user?.permissions?.includes(permission)))

export const ROLE_LABELS = {
  USER: 'Student',
  LECTURER: 'Lecturer',
  ACADEMIC_ADVISOR: 'Academic Advisor',
  REGISTRAR: 'Registrar',
  ADMIN: 'Administrator',
  SUPER_ADMIN: 'Super Admin',
  APPLICANT: 'Applicant',
}

/** Which app area a role lands in. Staff screens are gated by permission inside the staff area. */
export const areaForRole = (role) => {
  if (role === ROLES.USER) return 'student'
  if (role === ROLES.APPLICANT) return 'applicant'
  if (role === ROLES.LECTURER) return 'lecturer'
  return 'staff'
}

/** The super admin and applicants (their own personal email) change their password or name directly; everyone else asks the super admin. */
export const needsApproval = (user) => ![ROLES.SUPER_ADMIN, ROLES.APPLICANT].includes(user?.role?.name)

/** Admins and registrars share the staff area but get different dashboards and menus. */
export const isAdminRole = (role) => role === ROLES.ADMIN || role === ROLES.SUPER_ADMIN

export const homeForRole = (role) => `/${areaForRole(role)}`
