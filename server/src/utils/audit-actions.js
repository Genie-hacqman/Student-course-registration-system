/**
 * Every action string `audit.log` may record, with a label for the UI and a group.
 *
 * Existing strings are kept exactly as they were first written: rows are signed with their action and
 * history must stay filterable, so inconsistent names (`registration.approved` next to `registration.submit`,
 * `grades.enter` next to `result.amend`) are documented here rather than migrated. New events follow
 * `<thing>.<what_happened>` in the past tense.
 *
 * `shortRetention` events are routine or noisy (sign-ins, security signals) and are archived and purged after
 * 12 months instead of 24; they form the 'signin' stream in audit-integrity.js.
 *
 * Pure data, no imports: unit tests and the verify script load it without any configuration.
 */

const GROUPS = Object.freeze({
  AUTH: 'Sign-in and accounts',
  SECURITY: 'Security signals',
  USERS: 'Users and roles',
  ADMISSION: 'Admission',
  DIRECTORY: 'Departments, programmes and staff',
  ACADEMICS: 'Courses and timetable',
  REGISTRATION: 'Registration',
  TEACHING: 'Teaching and results',
  IMPORTS: 'Imports',
  SYSTEM: 'System',
});

const entries = (group, list, extra = {}) => list.map(([action, label]) => ({ action, label, group, ...extra }));

export const AUDIT_CATALOGUE = Object.freeze([
  // Sign-in and accounts
  ...entries(GROUPS.AUTH, [
    ['auth.login', 'Signed in'],
    ['auth.login_failed', 'Failed sign-in'],
    ['auth.login_locked', 'Sign-in refused (account locked)'],
  ], { shortRetention: true }),
  ...entries(GROUPS.AUTH, [
    ['auth.logout', 'Signed out'],
    ['auth.logout_all', 'Signed out everywhere'],
    ['auth.end_session', 'Session ended'],
    ['auth.activate', 'Account activated'],
    ['auth.change_password', 'Password changed'],
    ['auth.reset_password', 'Password reset'],
    ['auth.password_reset_issued', 'Password reset link issued'],
    ['auth.invite_issued', 'Invite link issued'],
    ['auth.change_pin', 'PIN changed'],
    ['auth.reset_pin', 'PIN reset by the student'],
    ['auth.pin_otp_sent', 'PIN reset code sent'],
    ['auth.refresh_reuse_detected', 'Stolen session token detected'],
    ['auth.update_profile', 'Profile updated'],
    ['auth.set_avatar', 'Profile picture set'],
    ['auth.remove_avatar', 'Profile picture removed'],
    ['auth.verify_email', 'Email verified'],
    ['auth.resend_verification', 'Verification email resent'],
    ['account_request.password_reset', 'Password reset requested'],
    ['account_request.name_change', 'Name change requested'],
    ['account_request.approved', 'Account request approved'],
    ['account_request.rejected', 'Account request rejected'],
    ['account_request.cancel', 'Account request cancelled'],
  ]),

  // Security signals (kept 12 months)
  ...entries(GROUPS.SECURITY, [
    ['security.login_blocked', 'Sign-in blocked (account not active)'],
    ['security.account_locked', 'Account locked after failed sign-ins'],
    ['security.pin_otp_failed', 'PIN reset code rejected'],
    ['security.credential_change_failed', 'Wrong current password or PIN'],
    ['security.token_invalid', 'Invalid or expired link token'],
    ['security.refresh_rejected', 'Session refresh rejected'],
    ['security.access_denied', 'Access denied'],
    ['security.rate_limited', 'Rate limit hit'],
  ], { shortRetention: true }),

  // Users and roles
  ...entries(GROUPS.USERS, [
    ['user.create', 'Account created'],
    ['user.update', 'Account changed'],
    ['user.sessions_viewed', "Another user's sessions viewed"],
    ['role.permissions.update', 'Role permissions changed'],
  ]),

  // Admission
  ...entries(GROUPS.ADMISSION, [
    ['application.sign_up', 'Applicant signed up'],
    ['application.save', 'Application saved'],
    ['application.submit', 'Application submitted'],
    ['application.admit', 'Application admitted'],
    ['application.reject', 'Application rejected'],
    ['application.resend_activation', 'Activation email resent'],
    ['application.photo_upload', 'Application photo uploaded'],
    ['application.photo_replace', 'Application photo replaced'],
    ['application.photo_remove', 'Application photo removed'],
    ['application.photo_viewed', 'Applicant photo viewed'],
    ['applicant.delete', 'Test applicant deleted'],
    ['student.admit', 'Student admitted'],
    ['student.pin_reset', 'Student PIN reset by staff'],
  ]),

  // Departments, programmes, staff
  ...entries(GROUPS.DIRECTORY, [
    ['department.create', 'Department created'],
    ['department.update', 'Department changed'],
    ['department.archive', 'Department archived'],
    ['department.activate', 'Department reopened'],
    ['department.delete', 'Department deleted'],
    ['program.create', 'Programme created'],
    ['program.update', 'Programme changed'],
    ['program.archive', 'Programme archived'],
    ['program.activate', 'Programme reopened'],
    ['program.delete', 'Programme deleted'],
    ['program.course_add', 'Course added to programme'],
    ['program.course_remove', 'Course removed from programme'],
    ['student.create', 'Student record created'],
    ['student.update', 'Student record changed'],
    ['student.results_viewed', "Student's results viewed by staff"],
    ['lecturer.create', 'Lecturer created'],
    ['lecturer.update', 'Lecturer changed'],
    ['lecturer.activate', 'Lecturer activated'],
    ['lecturer.deactivate', 'Lecturer deactivated'],
    ['lecturer.departments_update', 'Lecturer departments changed'],
    ['lecturer.assign', 'Lecturer assigned to a section'],
    ['lecturer.reassign', 'Section lecturer changed'],
    ['lecturer.unassign', 'Lecturer removed from a section'],
  ]),

  // Courses and timetable
  ...entries(GROUPS.ACADEMICS, [
    ['course.create', 'Course created'],
    ['course.update', 'Course changed'],
    ['course.deactivate', 'Course deactivated'],
    ['section.create', 'Section created'],
    ['section.update', 'Section changed'],
    ['section.delete', 'Section deleted'],
    ['section.cancel', 'Section cancelled'],
    ['schedule.create', 'Class time added'],
    ['schedule.update', 'Class time changed'],
    ['schedule.delete', 'Class time removed'],
    ['academic_year.create', 'Academic year created'],
    ['academic_year.update', 'Academic year changed'],
    ['semester.create', 'Semester created'],
    ['semester.update', 'Semester changed'],
    ['prerequisite.add', 'Prerequisite added'],
    ['prerequisite.remove', 'Prerequisite removed'],
    ['prerequisite.override_grant', 'Prerequisite override granted'],
    ['prerequisite.override_revoke', 'Prerequisite override revoked'],
    ['priority_window.create', 'Registration window created'],
    ['priority_window.update', 'Registration window changed'],
    ['priority_window.delete', 'Registration window deleted'],
    ['registration_time.override', 'Registration time overridden'],
    ['registration_time.override_remove', 'Registration time override removed'],
    ['timetable.allocation_failed', 'Timetable check failed on approval'],
    ['timetable.issue_resolved', 'Timetable issue resolved'],
  ]),

  // Registration
  ...entries(GROUPS.REGISTRATION, [
    ['registration.add', 'Course added'],
    ['registration.drop', 'Course dropped'],
    ['registration.staff_add', 'Course added by staff'],
    ['registration.staff_drop', 'Course dropped by staff'],
    ['registration.submit', 'Registration submitted'],
    ['registration.approved', 'Registration approved'],
    ['registration.rejected', 'Registration rejected'],
    ['registration.slip_printed', 'Slip printed'],
    ['registration.slip_viewed', "Student's slip viewed by staff"],
    ['waitlist.join', 'Joined waitlist'],
    ['waitlist.leave', 'Left waitlist'],
    ['waitlist.notified', 'Waitlist students told a seat opened'],
    ['waitlist.converted', 'Waitlist place converted to a seat'],
  ]),

  // Teaching and results
  ...entries(GROUPS.TEACHING, [
    ['grades.enter', 'Grades entered'],
    ['grades.finalize', 'Grades finalised'],
    ['result.amend', 'Final result amended'],
    ['results.import', 'Results imported'],
    ['attendance.record', 'Attendance taken'],
    ['attendance.update', 'Attendance changed'],
    ['attendance.delete', 'Attendance session deleted'],
    ['assessment.create', 'Assessment created'],
    ['assessment.update', 'Assessment changed'],
    ['assessment.delete', 'Assessment deleted'],
    ['assessment.score', 'Scores entered'],
    ['assessment.publish', 'Scores published'],
    ['announcement.create', 'Announcement sent'],
    ['announcement.update', 'Announcement changed'],
    ['announcement.delete', 'Announcement deleted'],
  ]),

  // Imports
  ...entries(GROUPS.IMPORTS, [
    ['import.departments', 'Departments imported'],
    ['import.programs', 'Programmes imported'],
    ['import.courses', 'Courses imported'],
    ['import.program_courses', 'Programme courses imported'],
    ['import.prerequisites', 'Prerequisites imported'],
    ['import.lecturers', 'Lecturers imported'],
    ['import.sections', 'Sections imported'],
    ['import.admissions', 'Students admitted in bulk'],
    ['import.invites', 'Invites sent in bulk'],
    ['import.course_catalog', 'Course catalogue imported'],
  ]),

  // System
  ...entries(GROUPS.SYSTEM, [
    ['settings.update', 'Settings changed'],
    ['audit.viewed', 'Audit log viewed'],
  ]),
]);

const BY_ACTION = new Map(AUDIT_CATALOGUE.map((e) => [e.action, e]));

export const isKnownAction = (action) => BY_ACTION.has(action);

/** The label for an action, or the action itself for one the catalogue does not know (older or test rows). */
export const actionLabel = (action) => BY_ACTION.get(action)?.label ?? action;

export const actionGroup = (action) => BY_ACTION.get(action)?.group ?? 'Other';

/** Actions archived and purged after 12 months instead of 24: sign-ins and security signals. */
export const SHORT_RETENTION_ACTIONS = Object.freeze(AUDIT_CATALOGUE.filter((e) => e.shortRetention).map((e) => e.action));
