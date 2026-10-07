export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  REGISTRAR: 'REGISTRAR',
  LECTURER: 'LECTURER',
  STUDENT: 'STUDENT',
});

export const ADMIN_ROLES = [ROLES.ADMIN, ROLES.REGISTRAR];
export const STAFF_ROLES = [...ADMIN_ROLES, ROLES.LECTURER];

export const PERMISSIONS = Object.freeze({
  COURSE_MANAGE: 'course:manage',
  COURSE_CATALOG: 'course:catalog',
  LECTURER_ASSIGN: 'lecturer:assign',
  SEMESTER_MANAGE: 'semester:manage',
  SECTION_MANAGE: 'section:manage',
  REGISTRATION_SELF: 'registration:self',
  REGISTRATION_APPROVE: 'registration:approve',
  REGISTRATION_VIEW_ALL: 'registration:view_all',
  USER_MANAGE: 'user:manage',
  REPORT_VIEW: 'report:view',
  AUDIT_VIEW: 'audit:view',
  SETTINGS_MANAGE: 'settings:manage',
  ROSTER_VIEW: 'roster:view',
  GRADE_ENTER: 'grade:enter',
  GRADE_MANAGE: 'grade:manage',
  PREREQ_OVERRIDE: 'prerequisite:override',
  REGISTRATION_MANAGE: 'registration:manage',
  ACCOUNT_APPROVE: 'account:approve',
  ATTENDANCE_RECORD: 'attendance:record',
  ASSESSMENT_MANAGE: 'assessment:manage',
  ANNOUNCEMENT_CREATE: 'announcement:create',
  ROLE_MANAGE: 'role:manage',
  STUDENT_ADMIT: 'student:admit',
  APPLICATION_SELF: 'application:self',
  APPLICATION_REVIEW: 'application:review',
  DIRECTORY_VIEW: 'directory:view',
});

const P = PERMISSIONS;

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.STUDENT]: [P.REGISTRATION_SELF, P.APPLICATION_SELF],
  [ROLES.LECTURER]: [P.ROSTER_VIEW, P.GRADE_ENTER, P.ATTENDANCE_RECORD, P.ASSESSMENT_MANAGE, P.ANNOUNCEMENT_CREATE],
  [ROLES.REGISTRAR]: [
    P.COURSE_CATALOG, P.LECTURER_ASSIGN, P.SEMESTER_MANAGE, P.SECTION_MANAGE,
    P.REGISTRATION_APPROVE, P.REGISTRATION_MANAGE, P.REGISTRATION_VIEW_ALL, P.PREREQ_OVERRIDE,
    P.ROSTER_VIEW, P.GRADE_MANAGE, P.ATTENDANCE_RECORD, P.REPORT_VIEW, P.ANNOUNCEMENT_CREATE, P.DIRECTORY_VIEW,
  ],
  [ROLES.ADMIN]: [
    P.USER_MANAGE, P.STUDENT_ADMIT, P.APPLICATION_REVIEW, P.COURSE_MANAGE, P.REGISTRATION_VIEW_ALL,
    P.REPORT_VIEW, P.AUDIT_VIEW, P.SETTINGS_MANAGE, P.ACCOUNT_APPROVE, P.ROLE_MANAGE, P.ANNOUNCEMENT_CREATE, P.DIRECTORY_VIEW,
  ],
});

export const PERMISSION_CATALOG = Object.freeze([
  { name: P.REGISTRATION_SELF, group: 'Registration', description: 'Register for courses as a student' },
  { name: P.REGISTRATION_VIEW_ALL, group: 'Registration', description: 'View all students and registrations' },
  { name: P.REGISTRATION_APPROVE, group: 'Registration', description: 'Approve or reject submitted registrations' },
  { name: P.REGISTRATION_MANAGE, group: 'Registration', description: 'Add or remove students from sections' },
  { name: P.PREREQ_OVERRIDE, group: 'Registration', description: 'Grant prerequisite waivers' },
  { name: P.STUDENT_ADMIT, group: 'Registration', description: 'Admit students (create their Student ID, school email and PIN) and reset student PINs' },
  { name: P.APPLICATION_SELF, group: 'Admission', description: 'Fill in and submit an online admission application' },
  { name: P.APPLICATION_REVIEW, group: 'Admission', description: 'Review online applications: admit (creating the student record) or reject' },
  { name: P.DIRECTORY_VIEW, group: 'Academic structure', description: 'Browse departments, programmes and lecturers, with their counts (read-only)' },
  { name: P.COURSE_MANAGE, group: 'Academic structure', description: 'Manage departments and programmes; view courses' },
  { name: P.COURSE_CATALOG, group: 'Academic structure', description: 'Create, import, edit and archive courses, their prerequisites and programme curricula' },
  { name: P.LECTURER_ASSIGN, group: 'Academic structure', description: 'Assign, change and remove the lecturer of a course offering' },
  { name: P.SEMESTER_MANAGE, group: 'Academic structure', description: 'Manage academic years, semesters and registration windows' },
  { name: P.SECTION_MANAGE, group: 'Academic structure', description: 'Manage course sections and timetables' },
  { name: P.ROSTER_VIEW, group: 'Teaching', description: 'View class lists' },
  { name: P.GRADE_ENTER, group: 'Teaching', description: 'Enter grades for own sections' },
  { name: P.GRADE_MANAGE, group: 'Teaching', description: 'Enter, amend and import any grades' },
  { name: P.ATTENDANCE_RECORD, group: 'Teaching', description: 'Take and edit class attendance' },
  { name: P.ASSESSMENT_MANAGE, group: 'Teaching', description: 'Create, score and publish assessments' },
  { name: P.ANNOUNCEMENT_CREATE, group: 'Communication', description: 'Post announcements' },
  { name: P.REPORT_VIEW, group: 'Reports', description: 'View registration and system reports' },
  { name: P.USER_MANAGE, group: 'System', description: 'Manage user accounts, students and lecturers' },
  { name: P.AUDIT_VIEW, group: 'System', description: 'View audit log and sign-in activity' },
  { name: P.SETTINGS_MANAGE, group: 'System', description: 'Change system settings' },
  { name: P.ACCOUNT_APPROVE, group: 'System', description: 'Approve password resets and name changes' },
  { name: P.ROLE_MANAGE, group: 'System', description: 'Edit role permissions' },
]);

export const EDITABLE_ROLES = Object.freeze([ROLES.REGISTRAR, ROLES.LECTURER]);

export const NON_GRANTABLE_PERMISSIONS = Object.freeze([P.ROLE_MANAGE, P.AUDIT_VIEW, P.REGISTRATION_SELF, P.APPLICATION_SELF]);

export const ATTENDANCE_STATUS = Object.freeze({ PRESENT: 'present', ABSENT: 'absent', LATE: 'late', EXCUSED: 'excused' });
export const ASSESSMENT_TYPES = Object.freeze(['quiz', 'assignment', 'midterm', 'exam', 'project', 'other']);
export const ASSESSMENT_STATUS = Object.freeze({ DRAFT: 'draft', PUBLISHED: 'published' });
export const ANNOUNCEMENT_AUDIENCE = Object.freeze({
  SECTION: 'section',
  PROGRAM: 'program',
  ALL_STUDENTS: 'all_students',
  ALL_LECTURERS: 'all_lecturers',
  ALL_STAFF: 'all_staff',
  EVERYONE: 'everyone',
});

export const ORG_STATUS = Object.freeze({ ACTIVE: 'active', ARCHIVED: 'archived' });
export const USER_STATUS = Object.freeze({ ACTIVE: 'active', SUSPENDED: 'suspended', PENDING: 'pending' });
export const STUDENT_STATUS = Object.freeze({ ACTIVE: 'active', PROBATION: 'probation', SUSPENDED: 'suspended', GRADUATED: 'graduated' });
export const COURSE_STATUS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive' });
export const SECTION_STATUS = Object.freeze({ OPEN: 'open', CLOSED: 'closed', CANCELLED: 'cancelled' });
export const SEMESTER_STATUS = Object.freeze({ UPCOMING: 'upcoming', ACTIVE: 'active', COMPLETED: 'completed' });

export const REGISTRATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
});

export const ADMISSION_STATUS = Object.freeze({
  NOT_SUBMITTED: 'NOT_SUBMITTED', PENDING: 'PENDING', ADMITTED: 'ADMITTED', REJECTED: 'REJECTED',
});

export const APPLICATION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  ADMITTED: 'admitted',
  REJECTED: 'rejected',
});

export const EMAIL_STATUS = Object.freeze({
  NOT_CONFIGURED: 'not_configured',
  SENT: 'sent',
  FAILED: 'failed',
  DELIVERED: 'delivered',
  DELIVERY_DELAYED: 'delivery_delayed',
  BOUNCED: 'bounced',
  COMPLAINED: 'complained',
});

export const ASSIGNMENT_STATUS = Object.freeze({ ACTIVE: 'active', ENDED: 'ended' });

export const TIMETABLE_ISSUE_TYPES = Object.freeze(['STUDENT', 'LECTURER', 'ROOM', 'UNSCHEDULED']);
export const TIMETABLE_ISSUE_STATUS = Object.freeze({ OPEN: 'open', RESOLVED: 'resolved' });

export const REGISTRATION_ITEM_STATUS = Object.freeze({ REGISTERED: 'registered', DROPPED: 'dropped' });
export const WAITLIST_STATUS = Object.freeze({ WAITING: 'waiting', NOTIFIED: 'notified', CONVERTED: 'converted', CANCELLED: 'cancelled' });

export const ACCOUNT_REQUEST_TYPE = Object.freeze({ PASSWORD_RESET: 'password_reset', NAME_CHANGE: 'name_change' });
export const ACCOUNT_REQUEST_STATUS = Object.freeze({ PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' });

export const STAFF_OVERRIDABLE_RULES = Object.freeze([
  'PREREQUISITE', 'CREDIT_LIMIT', 'TIMETABLE_CONFLICT', 'LEVEL_ELIGIBILITY', 'PROGRAM_ELIGIBILITY', 'SEMESTER_ELIGIBILITY',
]);

export const DAYS =Object.freeze(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

export const SOCKET_EVENTS = Object.freeze({
  COURSE_CAPACITY_UPDATED: 'course.capacity.updated',
  REGISTRATION_CREATED: 'registration.created',
  REGISTRATION_STATUS_CHANGED: 'registration.status.changed',
  TIMETABLE_UPDATED: 'timetable.updated',
  WAITLIST_SEAT_AVAILABLE: 'waitlist.seat.available',
  NOTIFICATION_CREATED: 'notification.created',
});

export const REFRESH_COOKIE = 'scrs_refresh';
