import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { GuestOnly, HomeRedirect, RequireArea, RequirePermission, RequirePinChange } from './auth/guards'
import { DATA_IMPORT_PERMS, PERMS } from './lib/roles'
import { SocketBridge } from './lib/socket'
import { FullPageSpinner } from './components/ui'
import AuthLayout from './layouts/AuthLayout'
import StudentLayout from './layouts/StudentLayout'
import StaffLayout from './layouts/StaffLayout'
import LecturerLayout from './layouts/LecturerLayout'
import Login from './pages/auth/Login'
import ChangePin from './pages/auth/ChangePin'
import ForgotPin from './pages/auth/ForgotPin'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import Apply from './pages/auth/Apply'
import Activate from './pages/auth/Activate'
import NotFound from './pages/NotFound'

// Every role's own pages (and Recharts) load on demand — only the layout shells and the auth pages
// needed before anyone's signed in (Login above all) are in the initial bundle.
const Admission = lazy(() => import('./pages/student/Admission'))
const Dashboard = lazy(() => import('./pages/student/Dashboard'))
const Catalog = lazy(() => import('./pages/student/Catalog'))
const CourseDetails = lazy(() => import('./pages/student/CourseDetails'))
const MyRegistration = lazy(() => import('./pages/student/MyRegistration'))
const Timetable = lazy(() => import('./pages/student/Timetable'))
const History = lazy(() => import('./pages/student/History'))
const Results = lazy(() => import('./pages/student/Results'))
const Notifications = lazy(() => import('./pages/student/Notifications'))
const Profile = lazy(() => import('./pages/student/Profile'))
const RegistrationWizard = lazy(() => import('./pages/student/RegistrationWizard'))
const AcademicCalendar = lazy(() => import('./pages/student/AcademicCalendar'))
const Account = lazy(() => import('./pages/Account'))
const StaffDashboard = lazy(() => import('./pages/staff/Dashboard'))
const Registrations = lazy(() => import('./pages/staff/Registrations'))
const RegistrationDetail = lazy(() => import('./pages/staff/RegistrationDetail'))
const Reports = lazy(() => import('./pages/staff/Reports'))
const Departments = lazy(() => import('./pages/admin/Departments'))
const DepartmentDetail = lazy(() => import('./pages/admin/DepartmentDetail'))
const Administrators = lazy(() => import('./pages/admin/Administrators'))
const Programs = lazy(() => import('./pages/admin/Programs'))
const ProgramDetail = lazy(() => import('./pages/admin/ProgramDetail'))
const Courses = lazy(() => import('./pages/admin/Courses'))
const CourseImport = lazy(() => import('./pages/admin/CourseImport'))
const Lecturers = lazy(() => import('./pages/admin/Lecturers'))
const LecturerDetail = lazy(() => import('./pages/admin/LecturerDetail'))
const CourseAssignments = lazy(() => import('./pages/staff/CourseAssignments'))
const CourseDetail = lazy(() => import('./pages/admin/CourseDetail'))
const Semesters = lazy(() => import('./pages/admin/Semesters'))
const SemesterDetail = lazy(() => import('./pages/admin/SemesterDetail'))
const Sections = lazy(() => import('./pages/admin/Sections'))
const SectionDetail = lazy(() => import('./pages/admin/SectionDetail'))
const Students = lazy(() => import('./pages/admin/Students'))
const StudentDetail = lazy(() => import('./pages/admin/StudentDetail'))
const Users = lazy(() => import('./pages/admin/Users'))
const UserDetail = lazy(() => import('./pages/admin/UserDetail'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const ResultsImport = lazy(() => import('./pages/admin/ResultsImport'))
const DataImport = lazy(() => import('./pages/admin/DataImport'))
const AccountRequests = lazy(() => import('./pages/admin/AccountRequests'))
const SignIns = lazy(() => import('./pages/admin/SignIns'))
const EmailLog = lazy(() => import('./pages/admin/EmailLog'))
const Applications = lazy(() => import('./pages/admin/Applications'))
const ApplicationDetail = lazy(() => import('./pages/admin/ApplicationDetail'))
const TimetableIssues = lazy(() => import('./pages/staff/TimetableIssues'))
const SectionClass = lazy(() => import('./components/SectionClass'))
const LecturerDashboard = lazy(() => import('./pages/lecturer/Dashboard'))
const LecturerTimetable = lazy(() => import('./pages/lecturer/Timetable'))
const LecturerCourses = lazy(() => import('./pages/lecturer/Courses'))
const CourseHub = lazy(() => import('./pages/lecturer/CourseHub'))
const LecturerStudents = lazy(() => import('./pages/lecturer/Students'))
const LecturerAttendance = lazy(() => import('./pages/lecturer/Attendance'))
const LecturerAssessments = lazy(() => import('./pages/lecturer/Assessments'))
const LecturerResults = lazy(() => import('./pages/lecturer/Results'))
const Announcements = lazy(() => import('./pages/Announcements'))
const RolesPermissions = lazy(() => import('./pages/admin/RolesPermissions'))

/** Old lecturer links (/lecturer/sections/:id) now open the course hub. */
function SectionRedirect() {
  const { id } = useParams()
  return <Navigate to={`/lecturer/courses/${id}`} replace />
}

export default function App() {
  return (
    <>
      <SocketBridge />
      <Suspense fallback={<FullPageSpinner />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<AuthLayout />}>
            <Route element={<GuestOnly />}>
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/forgot-pin" element={<ForgotPin />} />
              <Route path="/apply" element={<Apply />} />
            </Route>
            <Route element={<RequirePinChange />}>
              <Route path="/change-pin" element={<ChangePin />} />
            </Route>
            {/* No self sign-up: student accounts are created by the school at admission. */}
            <Route path="/register" element={<Navigate to="/login" replace />} />
            {/* Reachable while signed in too: emailed links may be opened in a logged-in browser. */}
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/activate-account" element={<Activate />} />
            {/* Links emailed before the path changed still work. */}
            <Route path="/activate" element={<Activate />} />
          </Route>

          <Route element={<RequireArea area="student" />}>
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="admission" element={<Admission />} />
              <Route path="courses" element={<Catalog />} />
              <Route path="courses/:id" element={<CourseDetails />} />
              <Route path="registration" element={<RegistrationWizard />} />
              <Route path="my-courses" element={<MyRegistration />} />
              <Route path="timetable" element={<Timetable />} />
              <Route path="calendar" element={<AcademicCalendar />} />
              <Route path="history" element={<History />} />
              <Route path="results" element={<Results />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Account />} />
            </Route>
          </Route>

          {/* Links from before the four-role model: applicants are students now. */}
          <Route path="/applicant/*" element={<Navigate to="/student/admission" replace />} />

          <Route element={<RequireArea area="lecturer" />}>
            <Route path="/lecturer" element={<LecturerLayout />}>
              <Route index element={<LecturerDashboard />} />
              <Route path="courses" element={<LecturerCourses />} />
              <Route path="courses/:id" element={<CourseHub />} />
              <Route path="sections/:id" element={<SectionRedirect />} />
              <Route path="students" element={<LecturerStudents />} />
              <Route element={<RequirePermission permission={PERMS.ATTENDANCE_RECORD} />}>
                <Route path="attendance" element={<LecturerAttendance />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.ASSESSMENT_MANAGE} />}>
                <Route path="assessments" element={<LecturerAssessments />} />
              </Route>
              <Route path="results" element={<LecturerResults />} />
              <Route path="timetable" element={<LecturerTimetable />} />
              <Route path="announcements" element={<Announcements />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="account" element={<Account />} />
            </Route>
          </Route>

          <Route element={<RequireArea area="staff" />}>
            <Route path="/staff" element={<StaffLayout />}>
              <Route index element={<StaffDashboard />} />
              <Route element={<RequirePermission permission={PERMS.REGISTRATION_VIEW_ALL} />}>
                <Route path="registrations" element={<Registrations />} />
                <Route path="registrations/:id" element={<RegistrationDetail />} />
                <Route path="timetable-issues" element={<TimetableIssues />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.APPLICATION_REVIEW} />}>
                <Route path="applications" element={<Applications />} />
                <Route path="applications/:id" element={<ApplicationDetail />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.REPORT_VIEW} />}>
                <Route path="reports" element={<Reports />} />
              </Route>
              {/* The directory: admins and registrars browse (directory:view); changes need course:manage, checked on each action. */}
              <Route element={<RequirePermission permission={[PERMS.DIRECTORY_VIEW, PERMS.COURSE_MANAGE]} />}>
                <Route path="departments" element={<Departments />} />
                <Route path="departments/:id" element={<DepartmentDetail />} />
                <Route path="programs" element={<Programs />} />
                <Route path="programs/:id" element={<ProgramDetail />} />
              </Route>
              {/* Admins view the catalogue (course:manage); the registry edits and imports it (course:catalog). */}
              <Route element={<RequirePermission permission={[PERMS.COURSE_MANAGE, PERMS.COURSE_CATALOG]} />}>
                <Route path="courses" element={<Courses />} />
                <Route path="courses/:id" element={<CourseDetail />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.COURSE_CATALOG} />}>
                <Route path="courses/import" element={<CourseImport />} />
              </Route>
              <Route element={<RequirePermission permission={[PERMS.DIRECTORY_VIEW, PERMS.USER_MANAGE]} />}>
                <Route path="lecturers" element={<Lecturers />} />
                <Route path="lecturers/:id" element={<LecturerDetail />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.LECTURER_ASSIGN} />}>
                <Route path="course-assignments" element={<CourseAssignments />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.SEMESTER_MANAGE} />}>
                <Route path="semesters" element={<Semesters />} />
                <Route path="semesters/:id" element={<SemesterDetail />} />
              </Route>
              {/* Offerings: the registry manages them (section:manage); admins can look (directory:view). */}
              <Route element={<RequirePermission permission={[PERMS.SECTION_MANAGE, PERMS.DIRECTORY_VIEW]} />}>
                <Route path="sections" element={<Sections />} />
                <Route path="sections/:id" element={<SectionDetail />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.ROSTER_VIEW} />}>
                <Route path="sections/:id/class" element={<SectionClass backTo="/staff/sections" backLabel="Sections" />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.REGISTRATION_VIEW_ALL} />}>
                <Route path="students" element={<Students />} />
                <Route path="students/:id" element={<StudentDetail />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.USER_MANAGE} />}>
                <Route path="users" element={<Users />} />
                <Route path="users/:id" element={<UserDetail />} />
                <Route path="administrators" element={<Administrators />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.AUDIT_VIEW} />}>
                <Route path="audit-log" element={<AuditLog />} />
                <Route path="sign-ins" element={<SignIns />} />
                <Route path="email-log" element={<EmailLog />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.ACCOUNT_APPROVE} />}>
                <Route path="account-requests" element={<AccountRequests />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.SETTINGS_MANAGE} />}>
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.GRADE_MANAGE} />}>
                <Route path="results-import" element={<ResultsImport />} />
              </Route>
              <Route element={<RequirePermission permission={DATA_IMPORT_PERMS} />}>
                <Route path="data-import" element={<DataImport />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.ROLE_MANAGE} />}>
                <Route path="roles" element={<RolesPermissions />} />
              </Route>
              <Route element={<RequirePermission permission={PERMS.ANNOUNCEMENT_CREATE} />}>
                <Route path="announcements" element={<Announcements />} />
              </Route>
              <Route path="notifications" element={<Notifications />} />
              <Route path="account" element={<Account />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </>
  )
}
