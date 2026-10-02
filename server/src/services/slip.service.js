import crypto from 'node:crypto';
import {
  Registration, Student, User, Program, Semester, AcademicYear,
} from '../models/index.js';
import env from '../config/env.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { REGISTRATION_STATUS, DAYS } from '../utils/constants.js';
import { getRegistrationDetail } from './registration.service.js';
import { lecturerName } from './timetable.service.js';
import * as studentService from './student.service.js';
import * as settingService from './setting.service.js';

const SLIP_KEY = crypto.createHash('sha256').update(`slip:${env.JWT_ACCESS_SECRET}`).digest();

/**
 * Code printed on the slip. It covers the reference, the status and the exact sections held,
 * so a printout stops verifying as soon as the student adds/drops a course or the status changes.
 */
export const verificationCode = ({ referenceNumber, status, sectionIds }) =>
  crypto
    .createHmac('sha256', SLIP_KEY)
    .update(`${referenceNumber}|${status}|${[...sectionIds].sort((a, b) => a - b).join(',')}`)
    .digest('hex')
    .slice(0, 10)
    .toUpperCase();

const formatSlot = (s) => `${s.day} ${s.startTime.slice(0, 5)}–${s.endTime.slice(0, 5)}${s.room ? ` ${s.room}` : ''}`;

const PRINTABLE = [REGISTRATION_STATUS.SUBMITTED, REGISTRATION_STATUS.APPROVED];

/**
 * Everything printed on the slip, straight from the database. The student's picture (`student.photo`)
 * is only loaded for the PDF (`withPhoto`): it is ~25 KB, and neither the JSON slip nor the public
 * verify endpoint should carry it.
 */
export const buildSlip = async (registrationId, { withPhoto = false } = {}) => {
  const registration = await Registration.findByPk(registrationId, {
    include: [
      {
        model: Student,
        as: 'student',
        include: [
          { model: User, as: 'user', attributes: ['firstName', 'lastName', 'email', ...(withPhoto ? ['avatar'] : [])] },
          { model: Program, as: 'program', attributes: ['name', 'code'] },
        ],
      },
      {
        model: Semester,
        as: 'semester',
        attributes: ['id', 'name', 'startDate', 'endDate'],
        include: [{ model: AcademicYear, as: 'academicYear', attributes: ['name'] }],
      },
      { model: User, as: 'reviewer', attributes: ['firstName', 'lastName'] },
    ],
  });
  if (!registration) throw new NotFoundError('Registration');
  if (!PRINTABLE.includes(registration.status)) {
    throw new ConflictError('Submit your registration before printing a slip');
  }

  const detail = await getRegistrationDetail(registration.id);
  const courses = detail.items
    .map((item) => ({
      courseSectionId: item.courseSectionId,
      code: item.section.course.code,
      title: item.section.course.title,
      section: item.section.sectionCode,
      credits: item.credits,
      lecturer: lecturerName(item.section.lecturer),
      schedule: [...item.section.schedules]
        .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.startTime.localeCompare(b.startTime))
        .map(formatSlot),
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const confirmed = registration.status === REGISTRATION_STATUS.APPROVED;
  const { student, semester, reviewer } = registration;
  return {
    institution: await settingService.get('institution.name'),
    referenceNumber: registration.referenceNumber,
    status: confirmed ? 'confirmed' : 'provisional',
    registrationStatus: registration.status,
    student: {
      name: `${student.user.firstName} ${student.user.lastName}`,
      studentNumber: student.studentNumber,
      email: student.user.email,
      program: student.program ? `${student.program.name} (${student.program.code})` : null,
      level: student.level,
      ...(withPhoto ? { photo: student.user.avatar ?? null } : {}),
    },
    semester: {
      id: semester.id,
      name: semester.name,
      academicYear: semester.academicYear?.name ?? null,
      startDate: semester.startDate,
      endDate: semester.endDate,
    },
    submittedAt: registration.submittedAt,
    approvedAt: confirmed ? registration.reviewedAt : null,
    approvedBy: confirmed && reviewer ? `${reviewer.firstName} ${reviewer.lastName}` : null,
    courses,
    totalCredits: courses.reduce((sum, c) => sum + c.credits, 0),
    printedAt: new Date(),
    verificationCode: verificationCode({
      referenceNumber: registration.referenceNumber,
      status: registration.status,
      sectionIds: courses.map((c) => c.courseSectionId),
    }),
  };
};

/** Students may only print their own registration (someone else's is reported as not found). */
export const getSlipForStudent = async (userId, registrationId, options) => {
  const student = await studentService.getByUserId(userId);
  const owned = await Registration.count({ where: { id: registrationId, studentId: student.id } });
  if (!owned) throw new NotFoundError('Registration');
  return buildSlip(registrationId, options);
};

export const getSlipForStaff = (registrationId, options) => buildSlip(registrationId, options);

const maskStudentNumber = (n) => (n.length <= 4 ? '****' : `${n.slice(0, 3)}${'*'.repeat(n.length - 5)}${n.slice(-2)}`);

/**
 * Checks a printed slip against the live registration. Returns details only when the code matches,
 * so the endpoint can't be used to look up other students' registrations.
 */
export const verify = async (referenceNumber, code) => {
  const registration = await Registration.findOne({ where: { referenceNumber } });
  if (!registration || !code) return { valid: false };

  let slip;
  try {
    slip = await buildSlip(registration.id);
  } catch {
    return { valid: false };
  }
  const expected = Buffer.from(slip.verificationCode);
  const given = Buffer.from(String(code).trim().toUpperCase());
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { valid: false };

  return {
    valid: true,
    referenceNumber: slip.referenceNumber,
    status: slip.status,
    student: { name: slip.student.name, studentNumber: maskStudentNumber(slip.student.studentNumber) },
    semester: slip.semester.name,
    courses: slip.courses.map((c) => c.code),
    totalCredits: slip.totalCredits,
  };
};
