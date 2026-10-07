import { Op } from 'sequelize';
import {
  sequelize, Waitlist, CourseSection, Course, Semester, Student, Registration, RegistrationItem,
} from '../models/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { WAITLIST_STATUS, SECTION_STATUS, REGISTRATION_ITEM_STATUS } from '../utils/constants.js';
import { emitWaitlistSeatAvailable } from '../sockets/registration.socket.js';
import * as notificationService from './notification.service.js';
import * as studentService from './student.service.js';
import * as settingService from './setting.service.js';
import * as audit from './audit.service.js';
import { summariseEntries } from '../utils/audit-diff.js';

const ACTIVE = [WAITLIST_STATUS.WAITING, WAITLIST_STATUS.NOTIFIED];

export const join = async (userId, courseSectionId) => {
  const student = await studentService.getByUserId(userId);

  const entry = await sequelize.transaction(async (transaction) => {
    // Locking the section serialises position assignment for concurrent joins.
    const section = await CourseSection.findByPk(courseSectionId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!section) throw new NotFoundError('Section');

    const semester = await Semester.findByPk(section.semesterId, { transaction });
    if (!semester?.isCurrent) throw new BadRequestError('You can only join waitlists for the current semester');
    if (section.status !== SECTION_STATUS.OPEN) throw new BadRequestError(`This section is ${section.status}`);
    const waitlistsOn = await settingService.get('registration.waitlistEnabled', { transaction });
    if (!waitlistsOn || !section.waitlistEnabled) throw new BadRequestError('Waitlist is not enabled for this section');
    if (section.seatsTaken < section.capacity) {
      throw new BadRequestError('Seats are still available — register for the section directly');
    }

    const alreadyRegistered = await RegistrationItem.count({
      where: { courseId: section.courseId, status: REGISTRATION_ITEM_STATUS.REGISTERED },
      include: [{ model: Registration, as: 'registration', where: { studentId: student.id, semesterId: semester.id } }],
      transaction,
    });
    if (alreadyRegistered) throw new ConflictError('You are already registered for this course');

    const existing = await Waitlist.findOne({ where: { studentId: student.id, courseSectionId }, transaction });
    if (existing && ACTIVE.includes(existing.status)) throw new ConflictError('You are already on this waitlist');

    const last = await Waitlist.max('position', { where: { courseSectionId, status: ACTIVE }, transaction });
    const position = (last ?? 0) + 1;

    const saved = existing
      ? await existing.update({ status: WAITLIST_STATUS.WAITING, position, notifiedAt: null }, { transaction })
      : await Waitlist.create({ studentId: student.id, courseSectionId, position }, { transaction });

    await audit.log({ userId, action: 'waitlist.join', entityType: 'Waitlist', entityId: saved.id, metadata: { courseSectionId, position }, transaction });
    return saved;
  });

  return entry;
};

export const listMine = async (userId) => {
  const student = await studentService.getByUserId(userId);
  return Waitlist.findAll({
    where: { studentId: student.id, status: ACTIVE },
    include: [{
      model: CourseSection,
      as: 'section',
      attributes: ['id', 'sectionCode', 'capacity', 'seatsTaken', 'semesterId'],
      include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits'] }],
    }],
    order: [['createdAt', 'ASC']],
  });
};

export const leave = async (userId, id) => {
  const student = await studentService.getByUserId(userId);
  const entry = await Waitlist.findOne({ where: { id, studentId: student.id, status: ACTIVE } });
  if (!entry) throw new NotFoundError('Waitlist entry');
  await sequelize.transaction(async (transaction) => {
    await entry.update({ status: WAITLIST_STATUS.CANCELLED }, { transaction });
    await audit.log({ userId, action: 'waitlist.leave', entityType: 'Waitlist', entityId: entry.id, metadata: { courseSectionId: entry.courseSectionId }, transaction });
  });
};

/** Marks the student's waitlist entry as converted once they get a seat in that section. */
export const markConverted = async (studentId, courseSectionId, { transaction } = {}) => {
  const [converted] = await Waitlist.update(
    { status: WAITLIST_STATUS.CONVERTED },
    { where: { studentId, courseSectionId, status: ACTIVE }, transaction },
  );
  // A system consequence of the registration that took the seat, so it is recorded with it (same transaction).
  if (converted > 0) {
    await audit.log({ action: 'waitlist.converted', entityType: 'CourseSection', entityId: courseSectionId, metadata: { studentId }, transaction });
  }
  return [converted];
};

/**
 * Called when seats free up. Notifies the next `count` waiting students (FIFO by position).
 * Seats are not reserved: notified students register through the normal flow, first come first served.
 */
export const notifyNext = async (section, { transaction, count = 1 } = {}) => {
  if (count <= 0) return [];

  const entries = await Waitlist.findAll({
    where: { courseSectionId: section.id, status: WAITLIST_STATUS.WAITING },
    include: [{ model: Student, as: 'student', attributes: ['id', 'userId'] }],
    order: [['position', 'ASC']],
    limit: count,
    transaction,
  });
  if (!entries.length) return [];

  const course = await Course.findByPk(section.courseId, { attributes: ['code', 'title'], transaction });
  await Waitlist.update(
    { status: WAITLIST_STATUS.NOTIFIED, notifiedAt: new Date() },
    { where: { id: { [Op.in]: entries.map((e) => e.id) } }, transaction },
  );

  // Who was told a seat opened: nothing else records it, and it decides who got a fair chance at the seat.
  await audit.log({
    action: 'waitlist.notified', entityType: 'CourseSection', entityId: section.id, transaction,
    metadata: { courseCode: course.code, ...summariseEntries(entries.map((e) => ({ studentId: e.student.id, position: e.position }))) },
  });

  for (const entry of entries) {
    const payload = { courseSectionId: section.id, courseCode: course.code, position: entry.position };
    await notificationService.create(
      {
        userId: entry.student.userId,
        type: 'WAITLIST_SEAT_AVAILABLE',
        title: `A seat opened in ${course.code}`,
        message: `A seat is now available in ${course.code} — ${course.title}. Register soon to claim it.`,
        data: payload,
      },
      { transaction },
    );
    transaction?.afterCommit(() => emitWaitlistSeatAvailable(entry.student.userId, payload));
  }
  return entries;
};
