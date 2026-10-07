import { Op } from 'sequelize';
import { sequelize, Schedule, CourseSection, Course, Lecturer } from '../models/index.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { SECTION_STATUS } from '../utils/constants.js';
import { slotsOverlap } from '../utils/time.js';
import * as audit from './audit.service.js';
import { snapshot, diffFields } from '../utils/audit-diff.js';
import * as notificationService from './notification.service.js';
import * as teachingService from './teaching.service.js';

const sectionInclude = {
  model: CourseSection,
  as: 'section',
  attributes: ['id', 'courseId', 'semesterId', 'lecturerId', 'sectionCode', 'status'],
  include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title'] }],
};

export const findConflicts = async ({ semesterId, lecturerId, slots, excludeScheduleIds = [], excludeSectionId, transaction }) => {
  if (!slots.length) return [];
  const days = [...new Set(slots.map((s) => s.day))];

  const candidates = await Schedule.findAll({
    where: { day: days, ...(excludeScheduleIds.length ? { id: { [Op.notIn]: excludeScheduleIds } } : {}) },
    include: [{
      ...sectionInclude,
      where: {
        semesterId,
        status: { [Op.ne]: SECTION_STATUS.CANCELLED },
        ...(excludeSectionId ? { id: { [Op.ne]: excludeSectionId } } : {}),
      },
    }],
    transaction,
  });

  const conflicts = [];
  for (const slot of slots) {
    for (const other of candidates) {
      if (!slotsOverlap(slot, other)) continue;
      const sameRoom = slot.room && other.room && slot.room.toLowerCase() === other.room.toLowerCase();
      const sameLecturer = lecturerId && other.section.lecturerId === lecturerId;
      if (!sameRoom && !sameLecturer) continue;
      conflicts.push({
        type: sameRoom ? 'ROOM' : 'LECTURER',
        sameRoom: Boolean(sameRoom),
        sameLecturer: Boolean(sameLecturer),
        day: other.day,
        startTime: other.startTime,
        endTime: other.endTime,
        room: other.room,
        sectionId: other.section.id,
        course: other.section.course.code,
      });
    }
  }
  return conflicts;
};

const loadSection = async (id) => {
  const section = await CourseSection.findByPk(id);
  if (!section) throw new NotFoundError('Section');
  return section;
};

export const list = ({ courseSectionId, semesterId } = {}) =>
  Schedule.findAll({
    where: courseSectionId ? { courseSectionId } : {},
    include: [{ ...sectionInclude, ...(semesterId ? { where: { semesterId } } : {}) }],
    order: [['day', 'ASC'], ['startTime', 'ASC']],
  });

export const getById = async (id) => {
  const schedule = await Schedule.findByPk(id, { include: [sectionInclude] });
  if (!schedule) throw new NotFoundError('Schedule');
  return schedule;
};

const assertNoSelfOverlap = async (sectionId, slot, excludeId) => {
  const siblings = await Schedule.findAll({
    where: { courseSectionId: sectionId, ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}) },
  });
  if (siblings.some((s) => slotsOverlap(slot, s))) {
    throw new ConflictError('This slot overlaps another slot of the same section');
  }
};

export const create = async (data, actor) => {
  const section = await loadSection(data.courseSectionId);
  await assertNoSelfOverlap(section.id, data);

  const conflicts = await findConflicts({
    semesterId: section.semesterId,
    lecturerId: section.lecturerId,
    slots: [data],
    excludeSectionId: section.id,
  });
  if (conflicts.length) throw new ConflictError('Schedule conflicts with existing classes', conflicts);

  const schedule = await sequelize.transaction(async (transaction) => {
    const created = await Schedule.create(data, { transaction });
    await audit.log({ userId: actor.id, action: 'schedule.create', entityType: 'Schedule', entityId: created.id, metadata: data, transaction });
    return created;
  });
  return getById(schedule.id);
};

export const update = async (id, data, actor) => {
  const schedule = await getById(id);
  const section = await loadSection(schedule.courseSectionId);
  const next = {
    day: data.day ?? schedule.day,
    startTime: data.startTime ?? schedule.startTime,
    endTime: data.endTime ?? schedule.endTime,
    room: data.room ?? schedule.room,
  };
  if (next.startTime >= next.endTime) {
    throw new ValidationError('Validation failed', [{ location: 'body', field: 'endTime', message: 'endTime must be after startTime' }]);
  }
  await assertNoSelfOverlap(section.id, next, schedule.id);

  const conflicts = await findConflicts({
    semesterId: section.semesterId,
    lecturerId: section.lecturerId,
    slots: [next],
    excludeSectionId: section.id,
  });
  if (conflicts.length) throw new ConflictError('Schedule conflicts with existing classes', conflicts);

  const changed = next.day !== schedule.day || next.startTime !== schedule.startTime
    || next.endTime !== schedule.endTime || next.room !== schedule.room;

  const fields = Object.keys(data);
  const before = snapshot(schedule, fields);
  await sequelize.transaction(async (transaction) => {
    await schedule.update(data, { transaction });
    await audit.log({
      userId: actor.id, action: 'schedule.update', entityType: 'Schedule', entityId: id, transaction,
      metadata: { courseSectionId: schedule.courseSectionId, ...diffFields(before, snapshot(schedule, fields)) },
    });
  });

  if (changed) {
    const course = await Course.findByPk(section.courseId, { attributes: ['code'] });
    const label = `${course.code} section ${section.sectionCode}`;
    const message = `The class schedule for ${label} changed to ${next.day} ${next.startTime}-${next.endTime}${next.room ? ` in ${next.room}` : ''}.`;
    const notify = (userId) => notificationService.create({ userId, type: 'SECTION_RESCHEDULED', title: 'Class schedule changed', message, data: { courseSectionId: section.id } });

    if (section.lecturerId) {
      const lecturer = await Lecturer.findByPk(section.lecturerId, { attributes: ['userId'] });
      if (lecturer) await notify(lecturer.userId);
    }
    const roster = await teachingService.rosterStudents(section.id);
    for (const student of roster) await notify(student.userId);
  }

  return getById(id);
};

export const remove = async (id, actor) => {
  const schedule = await getById(id);
  await sequelize.transaction(async (transaction) => {
    await schedule.destroy({ transaction });
    await audit.log({ userId: actor.id, action: 'schedule.delete', entityType: 'Schedule', entityId: id, metadata: { courseSectionId: schedule.courseSectionId }, transaction });
  });
};
