import {
  BarChart3, BookOpen, BookOpenCheck, Building2, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, FileBarChart,
  GraduationCap, History, KeyRound, Layers, LayoutDashboard, Library, LogIn, Mail, Megaphone, NotebookPen, ScrollText, Settings,
  ShieldCheck, ShieldUser, Upload, UserCheck, UserRound, Users, UsersRound, FileUp, FileSignature, CalendarX2, Presentation, UserCog,
} from 'lucide-react'
import {
  DATA_IMPORT_PERMS, PERMS, ROLES, can, isAdminRole, isAdmitted,
} from './roles'

export const STUDENT_NAV = [
  { to: '/student', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/student/admission', label: 'Admission Status', icon: FileSignature },
  { to: '/student/courses', label: 'Available Courses', icon: BookOpen },
  { to: '/student/registration', label: 'Course Registration', icon: ClipboardList },
  { to: '/student/my-courses', label: 'Registration & Slip', icon: BookOpenCheck },
  { to: '/student/results', label: 'Results', icon: GraduationCap },
  { to: '/student/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/student/calendar', label: 'Academic Calendar', icon: CalendarRange },
  { to: '/student/history', label: 'Registration History', icon: History },
  { to: '/student/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/student/profile', label: 'Profile', icon: UserRound },
  { to: '/student/settings', label: 'Settings', icon: Settings },
]

export const STUDENT_APPLYING_NAV = [
  { to: '/student/admission', label: 'Admission Status', icon: FileSignature },
  { to: '/student/settings', label: 'Settings', icon: Settings },
]

export const LECTURER_NAV = [
  { to: '/lecturer', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/lecturer/courses', label: 'My Courses', icon: BookOpen },
  { to: '/lecturer/students', label: 'Students', icon: UsersRound },
  { to: '/lecturer/attendance', label: 'Attendance', icon: UserCheck, permission: PERMS.ATTENDANCE_RECORD },
  { to: '/lecturer/assessments', label: 'Assessments', icon: NotebookPen, permission: PERMS.ASSESSMENT_MANAGE },
  { to: '/lecturer/results', label: 'Results', icon: GraduationCap },
  { to: '/lecturer/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/lecturer/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/lecturer/account', label: 'Profile', icon: UserRound, end: true, match: (loc) => !loc.search.includes('tab=') },
  { to: '/lecturer/account?tab=security', label: 'Settings', icon: Settings },
]

const DIRECTORY_ITEMS = [
  { to: '/staff/students', label: 'Students', icon: GraduationCap, permission: PERMS.REGISTRATION_VIEW_ALL },
  { to: '/staff/lecturers', label: 'Lecturers', icon: Presentation, permission: [PERMS.DIRECTORY_VIEW, PERMS.USER_MANAGE] },
  { to: '/staff/departments', label: 'Departments', icon: Building2, permission: [PERMS.DIRECTORY_VIEW, PERMS.COURSE_MANAGE] },
  { to: '/staff/programs', label: 'Programmes', icon: Library, permission: [PERMS.DIRECTORY_VIEW, PERMS.COURSE_MANAGE] },
  { to: '/staff/administrators', label: 'Administrators & Registrars', icon: ShieldUser, permission: PERMS.USER_MANAGE },
  { to: '/staff/users', label: 'All Users', icon: Users, permission: PERMS.USER_MANAGE },
]

const OFFERINGS_GROUP = {
  label: 'Course Offerings', icon: Layers, items: [
    { to: '/staff/sections', label: 'Offerings', icon: Layers, permission: [PERMS.SECTION_MANAGE, PERMS.DIRECTORY_VIEW] },
    { to: '/staff/course-assignments', label: 'Course assignments', icon: UserCog, permission: PERMS.LECTURER_ASSIGN },
    { to: '/staff/courses', label: 'Courses', icon: BookOpen, permission: [PERMS.COURSE_MANAGE, PERMS.COURSE_CATALOG] },
    { to: '/staff/semesters', label: 'Academic Years & Semesters', icon: CalendarRange, permission: PERMS.SEMESTER_MANAGE },
  ],
}

const AUDIT_GROUP = {
  label: 'Audit Logs', icon: ScrollText, items: [
    { to: '/staff/audit-log', label: 'Audit log', icon: ScrollText, permission: PERMS.AUDIT_VIEW },
    { to: '/staff/sign-ins', label: 'Sign-in activity', icon: LogIn, permission: PERMS.AUDIT_VIEW },
    { to: '/staff/email-log', label: 'Email log', icon: Mail, permission: PERMS.AUDIT_VIEW },
  ],
}

const ADMISSIONS_GROUP = {
  label: 'Admissions', icon: FileSignature, items: [
    { to: '/staff/applications', label: 'Admission applications', icon: FileSignature, permission: PERMS.APPLICATION_REVIEW },
    { to: '/staff/account-requests', label: 'Account requests', icon: UserCheck, permission: PERMS.ACCOUNT_APPROVE },
  ],
}

export const ADMIN_NAV = [
  { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true },
  ...DIRECTORY_ITEMS,
  OFFERINGS_GROUP,
  {
    label: 'Enrolments & Registration', icon: ClipboardCheck, items: [
      { to: '/staff/registrations', label: 'Registration overview', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL },
      { to: '/staff/timetable-issues', label: 'Timetable issues', icon: CalendarX2, permission: PERMS.REGISTRATION_VIEW_ALL },
      { to: '/staff/semesters', label: 'Registration settings', icon: CalendarRange, permission: PERMS.SEMESTER_MANAGE, match: () => false },
    ],
  },
  AUDIT_GROUP,
  ADMISSIONS_GROUP,
  { to: '/staff/reports', label: 'Reports', icon: BarChart3, permission: PERMS.REPORT_VIEW },
  { to: '/staff/announcements', label: 'Announcements', icon: Megaphone, permission: PERMS.ANNOUNCEMENT_CREATE },
  {
    label: 'Settings', icon: Settings, items: [
      { to: '/staff/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: PERMS.ROLE_MANAGE },
      { to: '/staff/settings', label: 'System settings', icon: Settings, permission: PERMS.SETTINGS_MANAGE },
      { to: '/staff/data-import', label: 'Import data', icon: FileUp, permission: DATA_IMPORT_PERMS },
      { to: '/staff/results-import', label: 'Import results', icon: Upload, permission: PERMS.GRADE_MANAGE },
      { to: '/staff/account', label: 'My account', icon: KeyRound },
    ],
  },
]

const regStatus = (status) => ({ search }) => new URLSearchParams(search).get('status') === status

export const REGISTRAR_NAV = [
  { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true },
  ...DIRECTORY_ITEMS,
  OFFERINGS_GROUP,
  {
    label: 'Enrolments & Registration', icon: ClipboardCheck, items: [
      { to: '/staff/registrations?status=submitted', label: 'Pending approval', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: (loc) => !new URLSearchParams(loc.search).has('status') || regStatus('submitted')(loc) },
      { to: '/staff/registrations?status=approved', label: 'Approved', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('approved') },
      { to: '/staff/registrations?status=rejected', label: 'Needs changes', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('rejected') },
      { to: '/staff/registrations?status=draft', label: 'In progress', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('draft') },
      { to: '/staff/registrations?status=', label: 'All registrations', icon: ClipboardList, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('') },
      { to: '/staff/timetable-issues', label: 'Timetable issues', icon: CalendarX2, permission: PERMS.REGISTRATION_VIEW_ALL },
    ],
  },
  AUDIT_GROUP,
  ADMISSIONS_GROUP,
  { to: '/staff/reports', label: 'Reports', icon: FileBarChart, permission: PERMS.REPORT_VIEW },
  { to: '/staff/announcements', label: 'Announcements', icon: Megaphone, permission: PERMS.ANNOUNCEMENT_CREATE },
  { to: '/staff/data-import', label: 'Import data', icon: FileUp, permission: DATA_IMPORT_PERMS },
  { to: '/staff/results-import', label: 'Import results', icon: Upload, permission: PERMS.GRADE_MANAGE },
  { to: '/staff/account', label: 'Profile', icon: UserRound, end: true, match: (loc) => !loc.search.includes('tab=') },
  { to: '/staff/account?tab=security', label: 'Settings', icon: Settings },
]

export const visibleNav = (nav, user) => nav
  .map((entry) => (entry.items ? { ...entry, items: entry.items.filter((i) => !i.permission || can(user, i.permission)) } : entry))
  .filter((entry) => (entry.items ? entry.items.length > 0 : !entry.permission || can(user, entry.permission)))

export const navForUser = (user) => {
  const role = user?.role?.name
  if (role === ROLES.STUDENT) return isAdmitted(user) ? STUDENT_NAV : STUDENT_APPLYING_NAV
  if (role === ROLES.LECTURER) return visibleNav(LECTURER_NAV, user)
  return visibleNav(isAdminRole(role) ? ADMIN_NAV : REGISTRAR_NAV, user)
}

export const flatNav = (nav) => nav.flatMap((e) => (e.items ? e.items.map((i) => ({ ...i, group: e.label })) : [e]))

export const SEGMENT_LABELS = {
  student: 'Student', lecturer: 'Lecturer', staff: 'Staff',
  registration: 'Registration', courses: 'Courses', 'my-courses': 'My Courses', results: 'Results', timetable: 'Timetable',
  calendar: 'Academic Calendar', history: 'Registration History', announcements: 'Announcements', notifications: 'Notifications',
  profile: 'Profile', settings: 'Settings', account: 'Account', students: 'Students', attendance: 'Attendance',
  assessments: 'Assessments', registrations: 'Registrations', reports: 'Reports', departments: 'Departments',
  programs: 'Programmes', semesters: 'Semesters', sections: 'Course Offerings', users: 'Users', 'audit-log': 'Audit Log',
  'sign-ins': 'Sign-in Activity', 'email-log': 'Email Log','account-requests': 'Account Requests', 'results-import': 'Import Results', 'data-import': 'Import Data',
  roles: 'Roles & Permissions', class: 'Class', import: 'Import',
  admission: 'Admission Status', applications: 'Applications', 'timetable-issues': 'Timetable Issues',
  lecturers: 'Lecturers', 'course-assignments': 'Course Assignments', administrators: 'Administrators & Registrars',
}
