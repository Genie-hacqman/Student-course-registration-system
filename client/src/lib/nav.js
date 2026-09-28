import {
  BarChart3, BookOpen, BookOpenCheck, Building2, CalendarDays, CalendarRange, ClipboardCheck, ClipboardList, FileBarChart,
  GraduationCap, History, KeyRound, Layers, LayoutDashboard, Library, LogIn, Megaphone, NotebookPen, ScrollText, Settings,
  ShieldCheck, Upload, UserCheck, UserRound, Users, UsersRound, FileUp, FileSignature, CalendarX2,
} from 'lucide-react'
import { DATA_IMPORT_PERMS, PERMS, can, isAdminRole } from './roles'

/**
 * Navigation per role. An entry is a link `{ to, label, icon, end?, permission? }` or a group
 * `{ label, icon, items: [links] }`. Hiding a link is only a convenience: every staff route is
 * also wrapped in RequirePermission, and the API enforces the same permissions.
 */

export const STUDENT_NAV = [
  { to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/student/registration', label: 'Registration', icon: ClipboardList },
  { to: '/student/courses', label: 'Course Catalog', icon: BookOpen },
  { to: '/student/my-courses', label: 'My Courses', icon: BookOpenCheck },
  { to: '/student/results', label: 'Results', icon: GraduationCap },
  { to: '/student/timetable', label: 'Timetable', icon: CalendarDays },
  { to: '/student/calendar', label: 'Academic Calendar', icon: CalendarRange },
  { to: '/student/history', label: 'Registration History', icon: History },
  { to: '/student/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/student/profile', label: 'Profile', icon: UserRound },
  { to: '/student/settings', label: 'Settings', icon: Settings },
]

export const APPLICANT_NAV = [
  { to: '/applicant', label: 'My application', icon: FileSignature, end: true },
  { to: '/applicant/settings', label: 'Settings', icon: Settings },
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

const ACADEMIC_ITEMS = [
  { to: '/staff/programs', label: 'Programmes', icon: Library, permission: PERMS.COURSE_MANAGE },
  { to: '/staff/departments', label: 'Departments', icon: Building2, permission: PERMS.COURSE_MANAGE },
  { to: '/staff/courses', label: 'Courses', icon: BookOpen, permission: [PERMS.COURSE_MANAGE, PERMS.COURSE_CATALOG] },
  { to: '/staff/sections', label: 'Course Offerings', icon: Layers, permission: PERMS.SECTION_MANAGE },
  { to: '/staff/semesters', label: 'Academic Years & Semesters', icon: CalendarRange, permission: PERMS.SEMESTER_MANAGE },
]

export const ADMIN_NAV = [
  { to: '/staff', label: 'Dashboard', icon: LayoutDashboard, end: true },
  {
    label: 'Users', icon: Users, items: [
      { to: '/staff/users', label: 'All users', icon: Users, permission: PERMS.USER_MANAGE },
      { to: '/staff/applications', label: 'Admission applications', icon: FileSignature, permission: PERMS.APPLICATION_REVIEW },
      { to: '/staff/students', label: 'Students', icon: GraduationCap, permission: PERMS.PREREQ_OVERRIDE },
      { to: '/staff/account-requests', label: 'Account requests', icon: UserCheck, permission: PERMS.ACCOUNT_APPROVE },
    ],
  },
  { label: 'Academic Management', icon: Library, items: ACADEMIC_ITEMS },
  {
    label: 'Registration', icon: ClipboardCheck, items: [
      { to: '/staff/registrations', label: 'Registration overview', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL },
      { to: '/staff/timetable-issues', label: 'Timetable issues', icon: CalendarX2, permission: PERMS.REGISTRATION_VIEW_ALL },
      { to: '/staff/semesters', label: 'Registration settings', icon: CalendarRange, permission: PERMS.SEMESTER_MANAGE, match: () => false },
    ],
  },
  { to: '/staff/reports', label: 'Reports', icon: BarChart3, permission: PERMS.REPORT_VIEW },
  { to: '/staff/announcements', label: 'Announcements', icon: Megaphone, permission: PERMS.ANNOUNCEMENT_CREATE },
  { to: '/staff/roles', label: 'Roles & Permissions', icon: ShieldCheck, permission: PERMS.ROLE_MANAGE },
  {
    label: 'Audit Logs', icon: ScrollText, items: [
      { to: '/staff/audit-log', label: 'Audit log', icon: ScrollText, permission: PERMS.AUDIT_VIEW },
      { to: '/staff/sign-ins', label: 'Sign-in activity', icon: LogIn, permission: PERMS.AUDIT_VIEW },
    ],
  },
  {
    label: 'Settings', icon: Settings, items: [
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
  {
    label: 'Students', icon: GraduationCap, items: [
      { to: '/staff/students', label: 'All students', icon: GraduationCap, permission: PERMS.PREREQ_OVERRIDE },
      { to: '/staff/registrations?status=', label: 'Registration status', icon: ClipboardList, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('') },
    ],
  },
  {
    label: 'Registration', icon: ClipboardCheck, items: [
      { to: '/staff/registrations?status=submitted', label: 'Pending', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: (loc) => !new URLSearchParams(loc.search).has('status') || regStatus('submitted')(loc) },
      { to: '/staff/registrations?status=approved', label: 'Approved', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('approved') },
      { to: '/staff/registrations?status=rejected', label: 'Needs changes', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('rejected') },
      { to: '/staff/registrations?status=draft', label: 'In progress', icon: ClipboardCheck, permission: PERMS.REGISTRATION_VIEW_ALL, match: regStatus('draft') },
      { to: '/staff/timetable-issues', label: 'Timetable issues', icon: CalendarX2, permission: PERMS.REGISTRATION_VIEW_ALL },
    ],
  },
  { label: 'Academic Structure', icon: Library, items: ACADEMIC_ITEMS },
  {
    label: 'Approvals', icon: UserCheck, items: [
      { to: '/staff/registrations?status=submitted', label: 'Pending approvals', icon: ClipboardCheck, permission: PERMS.REGISTRATION_APPROVE, match: () => false },
      { to: '/staff/applications', label: 'Admission applications', icon: FileSignature, permission: PERMS.APPLICATION_REVIEW },
      { to: '/staff/account-requests', label: 'Account requests', icon: UserCheck, permission: PERMS.ACCOUNT_APPROVE },
    ],
  },
  { to: '/staff/reports', label: 'Reports', icon: FileBarChart, permission: PERMS.REPORT_VIEW },
  { to: '/staff/announcements', label: 'Announcements', icon: Megaphone, permission: PERMS.ANNOUNCEMENT_CREATE },
  { to: '/staff/data-import', label: 'Import data', icon: FileUp, permission: DATA_IMPORT_PERMS },
  { to: '/staff/results-import', label: 'Import results', icon: Upload, permission: PERMS.GRADE_MANAGE },
  { to: '/staff/account', label: 'Profile', icon: UserRound, end: true, match: (loc) => !loc.search.includes('tab=') },
  { to: '/staff/account?tab=security', label: 'Settings', icon: Settings },
]

/** Drops links the user can't open, and groups left empty. */
export const visibleNav = (nav, user) => nav
  .map((entry) => (entry.items ? { ...entry, items: entry.items.filter((i) => !i.permission || can(user, i.permission)) } : entry))
  .filter((entry) => (entry.items ? entry.items.length > 0 : !entry.permission || can(user, entry.permission)))

export const navForUser = (user) => {
  const role = user?.role?.name
  if (role === 'USER') return STUDENT_NAV
  if (role === 'APPLICANT') return APPLICANT_NAV
  if (role === 'LECTURER') return visibleNav(LECTURER_NAV, user)
  return visibleNav(isAdminRole(role) ? ADMIN_NAV : REGISTRAR_NAV, user)
}

/** Every reachable link, flattened, for the quick-jump search. */
export const flatNav = (nav) => nav.flatMap((e) => (e.items ? e.items.map((i) => ({ ...i, group: e.label })) : [e]))

/** Page titles for breadcrumbs, by path segment. Unknown segments (ids) show as "Details". */
export const SEGMENT_LABELS = {
  student: 'Student', lecturer: 'Lecturer', staff: 'Staff',
  registration: 'Registration', courses: 'Courses', 'my-courses': 'My Courses', results: 'Results', timetable: 'Timetable',
  calendar: 'Academic Calendar', history: 'Registration History', announcements: 'Announcements', notifications: 'Notifications',
  profile: 'Profile', settings: 'Settings', account: 'Account', students: 'Students', attendance: 'Attendance',
  assessments: 'Assessments', registrations: 'Registrations', reports: 'Reports', departments: 'Departments',
  programs: 'Programmes', semesters: 'Semesters', sections: 'Course Offerings', users: 'Users', 'audit-log': 'Audit Log',
  'sign-ins': 'Sign-in Activity', 'account-requests': 'Account Requests', 'results-import': 'Import Results', 'data-import': 'Import Data',
  roles: 'Roles & Permissions', class: 'Class', import: 'Import',
  applicant: 'Applicant', applications: 'Applications', 'timetable-issues': 'Timetable Issues',
}
