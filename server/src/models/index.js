import sequelize from '../config/database.js';
import Role from './Role.js';
import User from './User.js';
import RefreshToken from './RefreshToken.js';
import RevokedAccessToken from './RevokedAccessToken.js';
import Department from './Department.js';
import Program from './Program.js';
import ProgramCourse from './ProgramCourse.js';
import Student from './Student.js';
import Lecturer from './Lecturer.js';
import AcademicYear from './AcademicYear.js';
import Semester from './Semester.js';
import Course from './Course.js';
import CoursePrerequisite from './CoursePrerequisite.js';
import PrerequisiteOverride from './PrerequisiteOverride.js';
import RegistrationPriorityWindow from './RegistrationPriorityWindow.js';
import RegistrationTimeOverride from './RegistrationTimeOverride.js';
import CourseSection from './CourseSection.js';
import Schedule from './Schedule.js';
import Result from './Result.js';
import Registration from './Registration.js';
import RegistrationItem from './RegistrationItem.js';
import Waitlist from './Waitlist.js';
import Notification from './Notification.js';
import AuditLog from './AuditLog.js';
import AuditSeal from './AuditSeal.js';
import Setting from './Setting.js';
import AccountChangeRequest from './AccountChangeRequest.js';
import RolePermissionOverride from './RolePermissionOverride.js';
import AttendanceSession from './AttendanceSession.js';
import AttendanceRecord from './AttendanceRecord.js';
import Assessment from './Assessment.js';
import AssessmentScore from './AssessmentScore.js';
import Announcement from './Announcement.js';
import AdmissionApplication from './AdmissionApplication.js';
import TimetableIssue from './TimetableIssue.js';
import SectionLecturerAssignment from './SectionLecturerAssignment.js';
import EmailDelivery from './EmailDelivery.js';
import LecturerDepartment from './LecturerDepartment.js';

Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
RevokedAccessToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(Student, { foreignKey: 'userId', as: 'student' });
Student.belongsTo(User, { foreignKey: 'userId', as: 'user' });

User.hasOne(Lecturer, { foreignKey: 'userId', as: 'lecturer' });
Lecturer.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Department.hasMany(Program, { foreignKey: 'departmentId', as: 'programs' });
Program.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Department.hasMany(Course, { foreignKey: 'departmentId', as: 'courses' });
Course.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });

Department.hasMany(Lecturer, { foreignKey: 'departmentId', as: 'lecturers' });
Lecturer.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
Lecturer.belongsToMany(Department, { through: LecturerDepartment, as: 'additionalDepartments', foreignKey: 'lecturerId', otherKey: 'departmentId' });
Department.belongsToMany(Lecturer, { through: LecturerDepartment, as: 'additionalLecturers', foreignKey: 'departmentId', otherKey: 'lecturerId' });

Program.belongsToMany(Course, { through: ProgramCourse, as: 'courses', foreignKey: 'programId', otherKey: 'courseId' });
Course.belongsToMany(Program, { through: ProgramCourse, as: 'programs', foreignKey: 'courseId', otherKey: 'programId' });
ProgramCourse.belongsTo(Program, { foreignKey: 'programId', as: 'program' });
ProgramCourse.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
ProgramCourse.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });

Program.hasMany(Student, { foreignKey: 'programId', as: 'students' });
Student.belongsTo(Program, { foreignKey: 'programId', as: 'program' });

AcademicYear.hasMany(Semester, { foreignKey: 'academicYearId', as: 'semesters' });
Semester.belongsTo(AcademicYear, { foreignKey: 'academicYearId', as: 'academicYear' });

Course.belongsToMany(Course, {
  through: CoursePrerequisite,
  as: 'prerequisites',
  foreignKey: 'courseId',
  otherKey: 'prerequisiteCourseId',
});
Course.belongsToMany(Course, {
  through: CoursePrerequisite,
  as: 'requiredBy',
  foreignKey: 'prerequisiteCourseId',
  otherKey: 'courseId',
});
CoursePrerequisite.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
CoursePrerequisite.belongsTo(Course, { foreignKey: 'prerequisiteCourseId', as: 'prerequisite' });

Course.hasMany(CourseSection, { foreignKey: 'courseId', as: 'sections' });
CourseSection.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

Semester.hasMany(CourseSection, { foreignKey: 'semesterId', as: 'sections' });
CourseSection.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });

Lecturer.hasMany(CourseSection, { foreignKey: 'lecturerId', as: 'sections' });
CourseSection.belongsTo(Lecturer, { foreignKey: 'lecturerId', as: 'lecturer' });

CourseSection.hasMany(Schedule, { foreignKey: 'courseSectionId', as: 'schedules' });
Schedule.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });

Student.hasMany(Result, { foreignKey: 'studentId', as: 'results' });
Result.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Result.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
Result.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });
Result.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
Result.belongsTo(User, { foreignKey: 'enteredBy', as: 'enteredByUser' });

PrerequisiteOverride.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
PrerequisiteOverride.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });
PrerequisiteOverride.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });
PrerequisiteOverride.belongsTo(User, { foreignKey: 'grantedBy', as: 'grantedByUser' });

Semester.hasMany(RegistrationPriorityWindow, { foreignKey: 'semesterId', as: 'priorityWindows' });
RegistrationPriorityWindow.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });
RegistrationPriorityWindow.belongsTo(Program, { foreignKey: 'programId', as: 'program' });
RegistrationTimeOverride.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
RegistrationTimeOverride.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });

Student.hasMany(Registration, { foreignKey: 'studentId', as: 'registrations' });
Registration.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
Registration.belongsTo(Semester, { foreignKey: 'semesterId', as: 'semester' });
Registration.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });

Student.hasMany(Waitlist, { foreignKey: 'studentId', as: 'waitlists' });
Waitlist.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });
CourseSection.hasMany(Waitlist, { foreignKey: 'courseSectionId', as: 'waitlists' });
Waitlist.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });

Registration.hasMany(RegistrationItem, { foreignKey: 'registrationId', as: 'items' });
RegistrationItem.belongsTo(Registration, { foreignKey: 'registrationId', as: 'registration' });
RegistrationItem.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
CourseSection.hasMany(RegistrationItem, { foreignKey: 'courseSectionId', as: 'registrationItems' });
RegistrationItem.belongsTo(Course, { foreignKey: 'courseId', as: 'course' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

RegistrationItem.belongsTo(User, { foreignKey: 'addedBy', as: 'addedByUser' });

User.hasMany(AccountChangeRequest, { foreignKey: 'userId', as: 'accountRequests' });
AccountChangeRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });
AccountChangeRequest.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });

Role.hasMany(RolePermissionOverride, { foreignKey: 'roleId', as: 'permissionOverrides' });
RolePermissionOverride.belongsTo(Role, { foreignKey: 'roleId', as: 'role' });

CourseSection.hasMany(AttendanceSession, { foreignKey: 'courseSectionId', as: 'attendanceSessions' });
AttendanceSession.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
AttendanceSession.belongsTo(Schedule, { foreignKey: 'scheduleId', as: 'schedule' });
AttendanceSession.hasMany(AttendanceRecord, { foreignKey: 'attendanceSessionId', as: 'records' });
AttendanceRecord.belongsTo(AttendanceSession, { foreignKey: 'attendanceSessionId', as: 'session' });
AttendanceRecord.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

CourseSection.hasMany(Assessment, { foreignKey: 'courseSectionId', as: 'assessments' });
Assessment.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
Assessment.hasMany(AssessmentScore, { foreignKey: 'assessmentId', as: 'scores' });
AssessmentScore.belongsTo(Assessment, { foreignKey: 'assessmentId', as: 'assessment' });
AssessmentScore.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Announcement.belongsTo(User, { foreignKey: 'authorId', as: 'author' });
Announcement.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
Announcement.belongsTo(Program, { foreignKey: 'programId', as: 'program' });

User.hasOne(AdmissionApplication, { foreignKey: 'userId', as: 'application' });
AdmissionApplication.belongsTo(User, { foreignKey: 'userId', as: 'user' });
AdmissionApplication.belongsTo(User, { foreignKey: 'reviewedBy', as: 'reviewer' });
AdmissionApplication.belongsTo(Program, { foreignKey: 'programId', as: 'program' });
AdmissionApplication.belongsTo(Department, { foreignKey: 'departmentId', as: 'department' });
AdmissionApplication.belongsTo(Student, { foreignKey: 'studentId', as: 'student' });

Registration.hasMany(TimetableIssue, { foreignKey: 'registrationId', as: 'timetableIssues' });
TimetableIssue.belongsTo(Registration, { foreignKey: 'registrationId', as: 'registration' });
TimetableIssue.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
TimetableIssue.belongsTo(User, { foreignKey: 'resolvedBy', as: 'resolver' });

CourseSection.hasMany(SectionLecturerAssignment, { foreignKey: 'courseSectionId', as: 'lecturerAssignments' });
SectionLecturerAssignment.belongsTo(CourseSection, { foreignKey: 'courseSectionId', as: 'section' });
Lecturer.hasMany(SectionLecturerAssignment, { foreignKey: 'lecturerId', as: 'assignments' });
SectionLecturerAssignment.belongsTo(Lecturer, { foreignKey: 'lecturerId', as: 'lecturer' });
SectionLecturerAssignment.belongsTo(User, { foreignKey: 'assignedBy', as: 'assigner' });
SectionLecturerAssignment.belongsTo(User, { foreignKey: 'endedBy', as: 'ender' });

EmailDelivery.belongsTo(User, { foreignKey: 'userId', as: 'user' });

export {
  sequelize,
  Role,
  User,
  RefreshToken,
  RevokedAccessToken,
  Department,
  Program,
  ProgramCourse,
  Student,
  Lecturer,
  AcademicYear,
  Semester,
  Course,
  CoursePrerequisite,
  PrerequisiteOverride,
  RegistrationPriorityWindow,
  RegistrationTimeOverride,
  CourseSection,
  Schedule,
  Result,
  Registration,
  RegistrationItem,
  Waitlist,
  Notification,
  AuditLog,
  AuditSeal,
  Setting,
  AccountChangeRequest,
  RolePermissionOverride,
  AttendanceSession,
  AttendanceRecord,
  Assessment,
  AssessmentScore,
  Announcement,
  AdmissionApplication,
  TimetableIssue,
  SectionLecturerAssignment,
  EmailDelivery,
  LecturerDepartment,
};
