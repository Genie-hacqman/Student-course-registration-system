import {
  sequelize, AttendanceSession, AttendanceRecord, Schedule,
} from '../models/index.js';
import {
  NotFoundError, ConflictError, BadRequestError,
} from '../utils/errors.js';
import { ATTENDANCE_STATUS, PERMISSIONS } from '../utils/constants.js';
import * as teaching from './teaching.service.js';
import * as studentService from './student.service.js';
import * as semesterService from './semester.service.js';
import * as audit from './audit.service.js';

const STATUSES = Object.values(ATTENDANCE_STATUS);
const emptyCounts = () => Object.fromEntries(STATUSES.map((s) => [s, 0]));

const tally = (records) => records.reduce((c, r) => { c[r.status] += 1; return c; }, emptyCounts());

/** Present or late counts as attended. */
const rate = (counts) => {
  const total = STATUSES.reduce((n, s) => n + counts[s], 0);
  return total ? Math.round(((counts.present + counts.late) / total) * 1000) / 10 : null;
};

const loadForTeacher = async (sectionId, actor, options) => {
  const section = await teaching.loadSection(sectionId, options);
  await teaching.assertCanTeach(section, actor, PERMISSIONS.ATTENDANCE_RECORD);
  return section;
};

const loadSession = async (sessionId, actor, { transaction } = {}) => {
  const session = await AttendanceSession.findByPk(sessionId, { transaction });
  if (!session) throw new NotFoundError('Attendance session');
  const section = await loadForTeacher(session.courseSectionId, actor, { transaction });
  return { session, section };
};

/** Every session in the section, plus each rostered student's totals. */
export const listForSection = async (sectionId, actor) => {
  const section = await loadForTeacher(sectionId, actor);
  const [roster, sessions] = await Promise.all([
    teaching.rosterStudents(section.id),
    AttendanceSession.findAll({
      where: { courseSectionId: section.id },
      include: [
        { model: AttendanceRecord, as: 'records', attributes: ['studentId', 'status'] },
        { model: Schedule, as: 'schedule', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
      ],
      order: [['date', 'DESC'], ['id', 'DESC']],
    }),
  ]);

  const byStudent = new Map(roster.map((s) => [s.id, emptyCounts()]));
  for (const session of sessions) {
    for (const r of session.records) {
      const counts = byStudent.get(r.studentId);
      if (counts) counts[r.status] += 1; // students who have since dropped aren't listed
    }
  }

  return {
    section: teaching.briefSection(section),
    sessions: sessions.map((s) => {
      const counts = tally(s.records);
      return {
        id: s.id, date: s.date, topic: s.topic, scheduleId: s.scheduleId, schedule: s.schedule,
        counts, total: s.records.length, rate: rate(counts),
      };
    }),
    students: roster.map((s) => {
      const counts = byStudent.get(s.id);
      return { ...teaching.studentSummary(s), counts, rate: rate(counts) };
    }),
  };
};

export const getSession = async (sessionId, actor) => {
  const { session, section } = await loadSession(sessionId, actor);
  const [roster, records] = await Promise.all([
    teaching.rosterStudents(section.id),
    AttendanceRecord.findAll({ where: { attendanceSessionId: session.id } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  return {
    id: session.id,
    date: session.date,
    topic: session.topic,
    scheduleId: session.scheduleId,
    section: teaching.briefSection(section),
    counts: tally(records),
    students: roster.map((s) => ({
      ...teaching.studentSummary(s),
      status: byStudent.get(s.id)?.status ?? null,
      remark: byStudent.get(s.id)?.remark ?? null,
    })),
  };
};

const checkOnRoster = (records, roster) => {
  const ids = new Set(roster.map((s) => s.id));
  const outsiders = records.filter((r) => !ids.has(r.studentId)).map((r) => r.studentId);
  if (outsiders.length) throw new BadRequestError('Some students are not registered in this section', { studentIds: outsiders });
};

/** Records a class meeting. Rostered students left out of `records` are marked present. */
export const createSession = async (sectionId, { date, scheduleId, topic, records }, actor, req) => {
  const id = await sequelize.transaction(async (transaction) => {
    const section = await loadForTeacher(sectionId, actor, { transaction });
    if (scheduleId) {
      const slot = await Schedule.findOne({ where: { id: scheduleId, courseSectionId: section.id }, transaction });
      if (!slot) throw new BadRequestError('That timetable slot does not belong to this section');
    }
    const duplicate = await AttendanceSession.findOne({
      where: { courseSectionId: section.id, date, scheduleId: scheduleId ?? null }, transaction,
    });
    if (duplicate) throw new ConflictError('Attendance for this class has already been taken', { sessionId: duplicate.id });

    const roster = await teaching.rosterStudents(section.id, { transaction });
    checkOnRoster(records, roster);
    const given = new Map(records.map((r) => [r.studentId, r]));

    const session = await AttendanceSession.create({
      courseSectionId: section.id, scheduleId: scheduleId ?? null, date, topic: topic || null, takenBy: actor.id,
    }, { transaction });
    await AttendanceRecord.bulkCreate(roster.map((s) => ({
      attendanceSessionId: session.id,
      studentId: s.id,
      status: given.get(s.id)?.status ?? ATTENDANCE_STATUS.PRESENT,
      remark: given.get(s.id)?.remark ?? null,
    })), { transaction });

    await audit.log({
      userId: actor.id, action: 'attendance.record', entityType: 'CourseSection', entityId: section.id,
      metadata: { sessionId: session.id, date, students: roster.length }, req, transaction,
    });
    return session.id;
  });
  return getSession(id, actor);
};

export const updateSession = async (sessionId, { topic, records }, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const { session, section } = await loadSession(sessionId, actor, { transaction });
    if (topic !== undefined) await session.update({ topic: topic || null }, { transaction });
    if (records?.length) {
      checkOnRoster(records, await teaching.rosterStudents(section.id, { transaction }));
      const existing = new Map((await AttendanceRecord.findAll({
        where: { attendanceSessionId: session.id }, transaction,
      })).map((r) => [r.studentId, r]));
      for (const r of records) {
        const fields = { status: r.status, remark: r.remark ?? null };
        const current = existing.get(r.studentId);
        if (current) await current.update(fields, { transaction });
        else await AttendanceRecord.create({ attendanceSessionId: session.id, studentId: r.studentId, ...fields }, { transaction });
      }
    }
    await audit.log({
      userId: actor.id, action: 'attendance.update', entityType: 'AttendanceSession', entityId: session.id,
      metadata: { changed: records?.length ?? 0 }, req, transaction,
    });
  });
  return getSession(sessionId, actor);
};

export const removeSession = async (sessionId, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const { session } = await loadSession(sessionId, actor, { transaction });
    await session.destroy({ transaction });
    await audit.log({
      userId: actor.id, action: 'attendance.delete', entityType: 'AttendanceSession', entityId: session.id,
      metadata: { date: session.date, courseSectionId: session.courseSectionId }, req, transaction,
    });
  });
};

/** A student's own attendance in each of their current-semester sections. */
export const forStudent = async (userId) => {
  const student = await studentService.getByUserId(userId);
  const semester = await semesterService.findCurrent();
  if (!semester) return [];
  const sections = await teaching.studentSections(student.id, semester.id);
  if (!sections.length) return [];

  const sessions = await AttendanceSession.findAll({
    where: { courseSectionId: sections.map((s) => s.id) },
    attributes: ['id', 'courseSectionId'],
    include: [{ model: AttendanceRecord, as: 'records', where: { studentId: student.id }, required: false, attributes: ['status'] }],
  });

  return sections.map((section) => {
    const mine = sessions.filter((s) => s.courseSectionId === section.id);
    const counts = tally(mine.flatMap((s) => s.records));
    return {
      section: { id: section.id, sectionCode: section.sectionCode, course: section.course },
      sessions: mine.length,
      counts,
      rate: rate(counts),
    };
  });
};
