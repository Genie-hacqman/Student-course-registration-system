import { Op } from 'sequelize';
import {
  sequelize, CourseSection, Course, Semester, Lecturer, User, Schedule, RegistrationItem,
} from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { COURSE_STATUS, SECTION_STATUS, REGISTRATION_ITEM_STATUS, ADMIN_ROLES } from '../utils/constants.js';
import { emitCapacityUpdated } from '../sockets/registration.socket.js';
import { findConflicts } from './schedule.service.js';
import * as waitlistService from './waitlist.service.js';
import * as notificationService from './notification.service.js';
import * as teachingService from './teaching.service.js';
import * as audit from './audit.service.js';

export const sectionIncludes = [
  { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits', 'level', 'status'] },
  { model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent'] },
  { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
  {
    model: Lecturer,
    as: 'lecturer',
    attributes: ['id', 'title', 'staffNumber'],
    include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
  },
];

export const list = async (query, actor) => {
  const { page, limit, offset, order } = buildPagination(query, ['sectionCode', 'capacity', 'createdAt']);
  const where = {};
  if (query.semesterId) where.semesterId = query.semesterId;
  if (query.courseId) where.courseId = query.courseId;
  if (query.lecturerId) where.lecturerId = query.lecturerId;
  if (ADMIN_ROLES.includes(actor?.role)) {
    if (query.status) where.status = query.status;
  } else {
    where.status = query.status && query.status !== SECTION_STATUS.CANCELLED
      ? query.status
      : { [Op.ne]: SECTION_STATUS.CANCELLED };
  }

  const result = await CourseSection.findAndCountAll({ where, include: sectionIncludes, limit, offset, order, distinct: true });
  return { result, page, limit };
};

export const getById = async (id) => {
  const section = await CourseSection.findByPk(id, { include: sectionIncludes });
  if (!section) throw new NotFoundError('Section');
  return section;
};

const assertLecturerFree = async (section, lecturerId) => {
  const slots = await Schedule.findAll({ where: { courseSectionId: section.id }, raw: true });
  const conflicts = await findConflicts({
    semesterId: section.semesterId,
    lecturerId,
    slots: slots.map(({ room, ...s }) => s), // only lecturer clashes matter here
    excludeSectionId: section.id,
  });
  if (conflicts.length) throw new ConflictError('Lecturer is already teaching at these times', conflicts);
};

export const create = async (data, actor) => {
  const course = await Course.findByPk(data.courseId);
  if (!course) throw new BadRequestError('Course does not exist');
  if (course.status !== COURSE_STATUS.ACTIVE) throw new BadRequestError('Cannot open a section for an inactive course');
  if (!(await Semester.findByPk(data.semesterId))) throw new BadRequestError('Semester does not exist');
  if (data.lecturerId && !(await Lecturer.findByPk(data.lecturerId))) throw new BadRequestError('Lecturer does not exist');

  const section = await CourseSection.create({ ...data, seatsTaken: 0 });
  await audit.log({ userId: actor.id, action: 'section.create', entityType: 'CourseSection', entityId: section.id });
  return getById(section.id);
};

/** Tells a lecturer they've been un/assigned, and everyone affected that a section was cancelled. */
const notifySectionChanges = async (section, { previousLecturerId, previousStatus, transaction }) => {
  const course = await Course.findByPk(section.courseId, { attributes: ['code'], transaction });
  const label = `${course.code} section ${section.sectionCode}`;
  const notifyLecturer = (lecturerId, type, title, message) => Lecturer.findByPk(lecturerId, { attributes: ['userId'], transaction })
    .then((lecturer) => lecturer && notificationService.create({ userId: lecturer.userId, type, title, message, data: { courseSectionId: section.id } }, { transaction }));

  const reassigned = previousLecturerId !== section.lecturerId;
  if (reassigned) {
    if (previousLecturerId) {
      await notifyLecturer(previousLecturerId, 'SECTION_UNASSIGNED', 'Section reassigned', `You are no longer assigned to teach ${label}.`);
    }
    if (section.lecturerId) {
      await notifyLecturer(section.lecturerId, 'SECTION_ASSIGNED', 'New section assigned', `You have been assigned to teach ${label}.`);
    }
  }

  const cancelled = section.status === SECTION_STATUS.CANCELLED && previousStatus !== SECTION_STATUS.CANCELLED;
  if (cancelled) {
    if (section.lecturerId) {
      await notifyLecturer(section.lecturerId, 'SECTION_CANCELLED', 'Section cancelled', `Your section ${label} has been cancelled.`);
    }
    const roster = await teachingService.rosterStudents(section.id, { transaction });
    for (const student of roster) {
      await notificationService.create({
        userId: student.userId,
        type: 'SECTION_CANCELLED',
        title: 'Section cancelled',
        message: `Your section ${label} has been cancelled. Please check your registration.`,
        data: { courseSectionId: section.id },
      }, { transaction });
    }
  }
};

export const update = async (id, data, actor) => {
  const updated = await sequelize.transaction(async (transaction) => {
    const section = await CourseSection.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!section) throw new NotFoundError('Section');

    if (data.capacity != null && data.capacity < section.seatsTaken) {
      throw new BadRequestError(`Capacity cannot be below the ${section.seatsTaken} seats already taken`);
    }
    if (data.lecturerId) {
      if (!(await Lecturer.findByPk(data.lecturerId, { transaction }))) throw new BadRequestError('Lecturer does not exist');
      await assertLecturerFree(section, data.lecturerId);
    }

    const capacityGrew = data.capacity != null && data.capacity > section.capacity;
    const previousLecturerId = section.lecturerId;
    const previousStatus = section.status;
    await section.update(data, { transaction });

    if (capacityGrew) {
      await waitlistService.notifyNext(section, { transaction, count: section.capacity - section.seatsTaken });
    }
    await notifySectionChanges(section, { previousLecturerId, previousStatus, transaction });
    await audit.log({ userId: actor.id, action: 'section.update', entityType: 'CourseSection', entityId: id, metadata: data, transaction });
    transaction.afterCommit(() => emitCapacityUpdated(section));
    return section;
  });
  return getById(updated.id);
};

/** Sections with registered students are cancelled rather than deleted. */
export const remove = async (id, actor) => {
  const section = await CourseSection.findByPk(id);
  if (!section) throw new NotFoundError('Section');

  const registered = await RegistrationItem.count({
    where: { courseSectionId: id, status: REGISTRATION_ITEM_STATUS.REGISTERED },
  });
  if (registered > 0) {
    throw new ConflictError(`Section has ${registered} registered students; set its status to cancelled instead`);
  }
  const everUsed = await RegistrationItem.count({ where: { courseSectionId: id } });
  if (everUsed > 0) await section.update({ status: SECTION_STATUS.CANCELLED });
  else await section.destroy();
  await audit.log({ userId: actor.id, action: 'section.delete', entityType: 'CourseSection', entityId: id });
};
