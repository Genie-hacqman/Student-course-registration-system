import {
  sequelize, CourseSection, Course, Semester, Lecturer, User, Department, AcademicYear, SectionLecturerAssignment,
} from '../models/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/errors.js';
import {
  ASSIGNMENT_STATUS, COURSE_STATUS, SECTION_STATUS, SEMESTER_STATUS, USER_STATUS,
} from '../utils/constants.js';
import { findConflicts } from './schedule.service.js';
import * as notificationService from './notification.service.js';
import * as settingService from './setting.service.js';
import * as audit from './audit.service.js';
import { belongsToDepartment } from './lecturer.service.js';

const lecturerLabel = (lecturer) =>
  [lecturer.title, lecturer.user?.firstName, lecturer.user?.lastName].filter(Boolean).join(' ') || lecturer.staffNumber;

const loadLecturer = (id, transaction) => Lecturer.findByPk(id, {
  include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'status'] }],
  transaction,
});

export const lecturerClashes = async (section, lecturerId, transaction) => {
  const slots = await section.getSchedules({ raw: true, transaction });
  return findConflicts({
    semesterId: section.semesterId,
    lecturerId,
    slots: slots.map(({ room, ...s }) => s),
    excludeSectionId: section.id,
    transaction,
  }).then((conflicts) => conflicts.filter((c) => c.sameLecturer));
};

const validateAssignment = async (section, lecturerId, transaction) => {
  const lecturer = await loadLecturer(lecturerId, transaction);
  if (!lecturer) throw new BadRequestError('Lecturer does not exist');
  if (lecturer.user?.status !== USER_STATUS.ACTIVE) {
    throw new BadRequestError(`${lecturerLabel(lecturer)} is not active and cannot be assigned`);
  }

  const course = await Course.findByPk(section.courseId, { attributes: ['id', 'code', 'title', 'status', 'departmentId'], transaction });
  if (course.status !== COURSE_STATUS.ACTIVE) throw new BadRequestError(`${course.code} is archived; restore it before assigning a lecturer`);

  if (await settingService.get('teaching.restrictLecturerDepartment', { transaction })
    && !(await belongsToDepartment(lecturer, course.departmentId, transaction))) {
    const [have, need] = await Promise.all([
      Department.findByPk(lecturer.departmentId, { attributes: ['name'], transaction }),
      Department.findByPk(course.departmentId, { attributes: ['name'], transaction }),
    ]);
    throw new BadRequestError(
      `${lecturerLabel(lecturer)} is in ${have?.name ?? 'another department'}; ${course.code} belongs to ${need?.name ?? 'a different department'}`,
    );
  }

  if (section.status === SECTION_STATUS.CANCELLED) throw new BadRequestError('This course offering is cancelled');
  const semester = await Semester.findByPk(section.semesterId, { attributes: ['id', 'name', 'status'], transaction });
  if (!semester) throw new BadRequestError('This course offering has no semester');
  if (semester.status === SEMESTER_STATUS.COMPLETED) {
    throw new BadRequestError(`${semester.name} is completed; its lecturer assignments can no longer change`);
  }

  if (section.lecturerId === lecturer.id) {
    throw new ConflictError(`${lecturerLabel(lecturer)} is already assigned to ${course.code} section ${section.sectionCode}`);
  }

  const clashes = await lecturerClashes(section, lecturer.id, transaction);
  if (clashes.length) {
    throw new ConflictError(`${lecturerLabel(lecturer)} is already teaching at these times`, clashes);
  }
  return { lecturer, course };
};

const endActive = (sectionId, actor, reason, transaction) => SectionLecturerAssignment.update(
  { status: ASSIGNMENT_STATUS.ENDED, endedBy: actor?.id ?? null, endedAt: new Date(), endReason: reason ?? null },
  { where: { courseSectionId: sectionId, status: ASSIGNMENT_STATUS.ACTIVE }, transaction },
);

const notify = async (lecturerId, type, title, message, sectionId, transaction) => {
  const lecturer = await Lecturer.findByPk(lecturerId, { attributes: ['userId'], transaction });
  if (lecturer) await notificationService.create({ userId: lecturer.userId, type, title, message, data: { courseSectionId: sectionId } }, { transaction });
};

export const assignLocked = async (section, lecturerId, actor, { reason, transaction, quiet = false }) => {
  const { lecturer, course } = await validateAssignment(section, lecturerId, transaction);
  const previousLecturerId = section.lecturerId;
  const label = `${course.code} section ${section.sectionCode}`;

  if (previousLecturerId) await endActive(section.id, actor, reason ?? 'Reassigned', transaction);
  await SectionLecturerAssignment.create({
    courseSectionId: section.id, lecturerId: lecturer.id, assignedBy: actor?.id ?? null, assignedAt: new Date(),
  }, { transaction });
  await section.update({ lecturerId: lecturer.id }, { transaction });

  if (!quiet) {
    if (previousLecturerId) {
      await notify(previousLecturerId, 'SECTION_UNASSIGNED', 'Section reassigned', `You are no longer assigned to teach ${label}.`, section.id, transaction);
    }
    await notify(lecturer.id, 'SECTION_ASSIGNED', 'New section assigned', `You have been assigned to teach ${label}.`, section.id, transaction);
  }
  await audit.log({
    userId: actor?.id ?? null,
    action: previousLecturerId ? 'lecturer.reassign' : 'lecturer.assign',
    entityType: 'CourseSection',
    entityId: section.id,
    metadata: {
      course: course.code, section: section.sectionCode, lecturerId: lecturer.id, lecturer: lecturerLabel(lecturer),
      previousLecturerId: previousLecturerId ?? null, ...(reason ? { reason } : {}),
    },
    transaction,
  });
  return section;
};

export const unassignLocked = async (section, actor, { reason, transaction, quiet = false }) => {
  if (!section.lecturerId) throw new ConflictError('This course offering has no lecturer assigned');
  const course = await Course.findByPk(section.courseId, { attributes: ['code'], transaction });
  const previousLecturerId = section.lecturerId;
  await endActive(section.id, actor, reason ?? 'Removed', transaction);
  await section.update({ lecturerId: null }, { transaction });
  if (!quiet) await notify(previousLecturerId, 'SECTION_UNASSIGNED', 'Section unassigned', `You are no longer assigned to teach ${course.code} section ${section.sectionCode}.`, section.id, transaction);
  await audit.log({
    userId: actor?.id ?? null, action: 'lecturer.unassign', entityType: 'CourseSection', entityId: section.id,
    metadata: { course: course.code, section: section.sectionCode, previousLecturerId, ...(reason ? { reason } : {}) },
    transaction,
  });
  return section;
};

const lockSection = async (id, transaction) => {
  const section = await CourseSection.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!section) throw new NotFoundError('Course offering');
  return section;
};

export const assign = async (sectionId, { lecturerId, reason }, actor) => {
  await sequelize.transaction(async (transaction) => {
    await assignLocked(await lockSection(sectionId, transaction), lecturerId, actor, { reason, transaction });
  });
  return history(sectionId);
};

export const unassign = async (sectionId, { reason } = {}, actor) => {
  await sequelize.transaction(async (transaction) => {
    await unassignLocked(await lockSection(sectionId, transaction), actor, { reason, transaction });
  });
  return history(sectionId);
};

const personInclude = (as) => ({ model: User, as, attributes: ['id', 'firstName', 'lastName'] });

export const history = async (sectionId) => {
  const section = await CourseSection.findByPk(sectionId, {
    attributes: ['id', 'sectionCode', 'lecturerId', 'status'],
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'departmentId'] },
      {
        model: Semester, as: 'semester', attributes: ['id', 'name', 'status'],
        include: [{ model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] }],
      },
    ],
  });
  if (!section) throw new NotFoundError('Course offering');
  const assignments = await SectionLecturerAssignment.findAll({
    where: { courseSectionId: sectionId },
    include: [
      {
        model: Lecturer, as: 'lecturer', attributes: ['id', 'title', 'staffNumber'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      },
      personInclude('assigner'),
      personInclude('ender'),
    ],
    order: [['assignedAt', 'DESC'], ['id', 'DESC']],
  });
  return { section, assignments };
};
