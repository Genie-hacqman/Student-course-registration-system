import {
  sequelize, Registration, RegistrationItem, CourseSection, Course, Schedule, Lecturer, User, Student, TimetableIssue,
} from '../models/index.js';
import { DAYS, REGISTRATION_ITEM_STATUS, SECTION_STATUS, TIMETABLE_ISSUE_STATUS } from '../utils/constants.js';
import { slotsOverlap } from '../utils/time.js';
import * as studentService from './student.service.js';
import * as lecturerService from './lecturer.service.js';
import * as semesterService from './semester.service.js';
import { findConflicts } from './schedule.service.js';
import * as audit from './audit.service.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { buildPagination } from '../utils/pagination.js';

const sectionInclude = [
  { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits'] },
  { model: Schedule, as: 'schedules', attributes: ['day', 'startTime', 'endTime', 'room'] },
  {
    model: Lecturer,
    as: 'lecturer',
    attributes: ['id', 'title'],
    include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
  },
];

export const lecturerName = (lecturer) =>
  lecturer ? [lecturer.title, lecturer.user?.firstName, lecturer.user?.lastName].filter(Boolean).join(' ') : null;

export const buildTimetable = (sections) => {
  const slots = sections.flatMap((section) =>
    section.schedules.map((s) => ({
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      room: s.room,
      sectionId: section.id,
      sectionCode: section.sectionCode,
      course: { id: section.course.id, code: section.course.code, title: section.course.title, credits: section.course.credits },
      lecturer: lecturerName(section.lecturer),
    })));

  const days = DAYS
    .map((day) => ({
      day,
      classes: slots.filter((s) => s.day === day).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter((d) => d.classes.length);

  const conflicts = [];
  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      if (slots[i].sectionId !== slots[j].sectionId && slotsOverlap(slots[i], slots[j])) {
        conflicts.push({ day: slots[i].day, courses: [slots[i].course.code, slots[j].course.code] });
      }
    }
  }

  return { days, conflicts, totalCredits: [...new Map(sections.map((s) => [s.id, s.course.credits])).values()].reduce((a, b) => a + b, 0) };
};

const resolveSemester = async (semesterId) => {
  if (semesterId) return semesterService.getById(semesterId);
  const current = await semesterService.findCurrent();
  if (!current) throw new NotFoundError('Current semester');
  return current;
};

export const forStudent = async (userId, semesterId) => {
  const student = await studentService.getByUserId(userId);
  const semester = await resolveSemester(semesterId);

  const registration = await Registration.findOne({
    where: { studentId: student.id, semesterId: semester.id },
    include: [{
      model: RegistrationItem,
      as: 'items',
      required: false,
      where: { status: REGISTRATION_ITEM_STATUS.REGISTERED },
      include: [{ model: CourseSection, as: 'section', include: sectionInclude }],
    }],
  });

  const sections = registration?.items.map((i) => i.section) ?? [];
  return {
    semester: { id: semester.id, name: semester.name },
    registrationStatus: registration?.status ?? null,
    ...buildTimetable(sections),
  };
};

export const forLecturer = async (userId, semesterId) => {
  const lecturer = await lecturerService.getByUserId(userId);
  const semester = await resolveSemester(semesterId);

  const sections = await CourseSection.findAll({
    where: { lecturerId: lecturer.id, semesterId: semester.id, status: [SECTION_STATUS.OPEN, SECTION_STATUS.CLOSED] },
    include: sectionInclude,
  });

  return { semester: { id: semester.id, name: semester.name }, ...buildTimetable(sections) };
};

const slotOf = (s) => ({ day: s.day, startTime: s.startTime, endTime: s.endTime, room: s.room });
const label = (s) => `${s.day} ${String(s.startTime).slice(0, 5)}-${String(s.endTime).slice(0, 5)}`;

export const findAllocationIssues = async (registrationId, transaction) => {
  const items = await RegistrationItem.findAll({
    where: { registrationId, status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [{
      model: CourseSection,
      as: 'section',
      attributes: ['id', 'semesterId', 'lecturerId', 'sectionCode'],
      include: [
        { model: Course, as: 'course', attributes: ['id', 'code'] },
        { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
      ],
    }],
    transaction,
  });

  const found = new Map();
  const add = (section, type, detail) => {
    const key = `${section.id}:${type}`;
    if (!found.has(key)) found.set(key, { courseSectionId: section.id, courseCode: section.course.code, type, details: [] });
    found.get(key).details.push(detail);
  };

  for (const { section } of items) {
    if (!section.schedules.length) add(section, 'UNSCHEDULED', { message: `${section.course.code} has no class times configured` });
    for (const slot of section.schedules.filter((s) => !s.room)) {
      add(section, 'UNSCHEDULED', { message: `${section.course.code} ${label(slot)} has no room assigned` });
    }

    const clashes = await findConflicts({
      semesterId: section.semesterId,
      lecturerId: section.lecturerId,
      slots: section.schedules.map(slotOf),
      excludeSectionId: section.id,
      transaction,
    });
    for (const c of clashes) {
      const types = [c.sameRoom && 'ROOM', c.sameLecturer && 'LECTURER'].filter(Boolean);
      for (const type of types) {
        add(section, type, {
          message: `${section.course.code} ${type === 'ROOM' ? `room ${c.room}` : 'lecturer'} is also booked for ${c.course} ${label(c)}`,
          withSectionId: c.sectionId,
          withCourse: c.course,
        });
      }
    }
  }

  const clashAllowed = (item) => item.overriddenRules?.includes('TIMETABLE_CONFLICT');
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (clashAllowed(items[i]) || clashAllowed(items[j])) continue;
      const [a, b] = [items[i].section, items[j].section];
      for (const sa of a.schedules) {
        const sb = b.schedules.find((x) => slotsOverlap(sa, x));
        if (!sb) continue;
        add(a, 'STUDENT', { message: `${a.course.code} ${label(sa)} overlaps ${b.course.code} ${label(sb)}`, withSectionId: b.id, withCourse: b.course.code });
        add(b, 'STUDENT', { message: `${b.course.code} ${label(sb)} overlaps ${a.course.code} ${label(sa)}`, withSectionId: a.id, withCourse: a.course.code });
      }
    }
  }
  return [...found.values()];
};

export const recordIssues = async (registrationId, issues, actor) => sequelize.transaction(async (transaction) => {
  for (const issue of issues) {
    const [row, created] = await TimetableIssue.findOrCreate({
      where: { registrationId, courseSectionId: issue.courseSectionId, type: issue.type },
      defaults: { details: issue.details, detectedBy: actor.id },
      transaction,
    });
    if (!created) {
      await row.update({
        details: issue.details, status: TIMETABLE_ISSUE_STATUS.OPEN, detectedBy: actor.id, resolvedBy: null, resolvedAt: null, resolutionNote: null,
      }, { transaction });
    }
  }
  await audit.log({
    userId: actor.id, action: 'timetable.allocation_failed', entityType: 'Registration', entityId: registrationId,
    metadata: { issues: issues.map(({ courseCode, type }) => ({ courseCode, type })) }, transaction,
  });
});

export const closeIssues = async (registrationId, actor, transaction) => {
  const [closed] = await TimetableIssue.update(
    { status: TIMETABLE_ISSUE_STATUS.RESOLVED, resolvedBy: actor.id, resolvedAt: new Date(), resolutionNote: 'Timetable confirmed on approval' },
    { where: { registrationId, status: TIMETABLE_ISSUE_STATUS.OPEN }, transaction },
  );
  return closed;
};

const issueInclude = [
  {
    model: Registration,
    as: 'registration',
    attributes: ['id', 'status', 'referenceNumber', 'semesterId'],
    include: [{
      model: Student,
      as: 'student',
      attributes: ['id', 'studentNumber'],
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
    }],
  },
  {
    model: CourseSection,
    as: 'section',
    attributes: ['id', 'sectionCode'],
    include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title'] }],
  },
  { model: User, as: 'resolver', attributes: ['id', 'firstName', 'lastName'] },
];

export const listIssues = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['updatedAt', 'createdAt'], ['updatedAt', 'DESC']);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.registrationId) where.registrationId = query.registrationId;
  if (query.type) where.type = query.type;
  const result = await TimetableIssue.findAndCountAll({ where, include: issueInclude, limit, offset, order, distinct: true });
  return { result, page, limit };
};

export const resolveIssue = async (id, { note }, actor, req) => {
  const issue = await TimetableIssue.findByPk(id);
  if (!issue) throw new NotFoundError('Timetable issue');
  if (issue.status !== TIMETABLE_ISSUE_STATUS.OPEN) throw new ConflictError('This issue is already resolved');
  await sequelize.transaction(async (transaction) => {
    await issue.update({ status: TIMETABLE_ISSUE_STATUS.RESOLVED, resolvedBy: actor.id, resolvedAt: new Date(), resolutionNote: note }, { transaction });
    await audit.log({ userId: actor.id, action: 'timetable.issue_resolved', entityType: 'TimetableIssue', entityId: id, metadata: { note }, req, transaction });
  });
  return TimetableIssue.findByPk(id, { include: issueInclude });
};
