import {
  sequelize, RegistrationPriorityWindow, RegistrationTimeOverride, Semester, Student, Program, User,
} from '../models/index.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import * as notificationService from './notification.service.js';
import * as audit from './audit.service.js';

const windowMatches = (window, student) =>
  (window.minLevel == null || student.level >= window.minLevel)
  && (window.programId == null || window.programId === student.programId);

/**
 * Pure resolution of when a student may start registering.
 * 1. An individual override wins.
 * 2. Otherwise the earliest window the student matches.
 * 3. A student matching no window waits for the latest window (the general slot).
 * 4. With no windows at all, everyone starts at semester.registrationStart.
 */
export const resolveOpensAtFrom = ({ semester, student, windows, override }) => {
  if (override) return { opensAt: new Date(override.opensAt), source: 'override', windowName: 'Individual registration time' };
  if (!windows.length) return { opensAt: new Date(semester.registrationStart), source: 'semester', windowName: null };

  const sorted = [...windows].sort((a, b) => new Date(a.opensAt) - new Date(b.opensAt));
  const match = sorted.find((w) => windowMatches(w, student)) ?? sorted[sorted.length - 1];
  return { opensAt: new Date(match.opensAt), source: 'window', windowName: match.name };
};

export const resolveOpensAt = async (student, semester, { transaction } = {}) => {
  const [windows, override] = await Promise.all([
    RegistrationPriorityWindow.findAll({ where: { semesterId: semester.id }, transaction }),
    RegistrationTimeOverride.findOne({ where: { studentId: student.id, semesterId: semester.id }, transaction }),
  ]);
  return resolveOpensAtFrom({ semester, student, windows, override });
};

// ── registrar management ──────────────────────────────────────────────────────

const loadSemester = async (semesterId, transaction) => {
  const semester = await Semester.findByPk(semesterId, { transaction });
  if (!semester) throw new NotFoundError('Semester');
  return semester;
};

const assertWithinRegistration = (semester, opensAt) => {
  const at = new Date(opensAt);
  if (at < semester.registrationStart || at > semester.registrationEnd) {
    throw new BadRequestError(
      `opensAt must be between ${semester.registrationStart.toISOString()} and ${semester.registrationEnd.toISOString()}`,
    );
  }
};

export const listWindows = async (semesterId) => {
  await loadSemester(semesterId);
  return RegistrationPriorityWindow.findAll({
    where: { semesterId },
    include: [{ model: Program, as: 'program', attributes: ['id', 'code', 'name'] }],
    order: [['opensAt', 'ASC']],
  });
};

export const createWindow = async (semesterId, data, actor) => {
  const semester = await loadSemester(semesterId);
  assertWithinRegistration(semester, data.opensAt);
  if (data.programId && !(await Program.findByPk(data.programId))) throw new BadRequestError('Program does not exist');
  const window = await RegistrationPriorityWindow.create({ ...data, semesterId });
  await audit.log({ userId: actor.id, action: 'priority_window.create', entityType: 'Semester', entityId: semesterId, metadata: data });
  return window;
};

export const updateWindow = async (semesterId, windowId, data, actor) => {
  const semester = await loadSemester(semesterId);
  const window = await RegistrationPriorityWindow.findOne({ where: { id: windowId, semesterId } });
  if (!window) throw new NotFoundError('Priority window');
  if (data.opensAt) assertWithinRegistration(semester, data.opensAt);
  if (data.programId && !(await Program.findByPk(data.programId))) throw new BadRequestError('Program does not exist');
  await window.update(data);
  await audit.log({ userId: actor.id, action: 'priority_window.update', entityType: 'Semester', entityId: semesterId, metadata: { windowId, ...data } });
  return window;
};

export const deleteWindow = async (semesterId, windowId, actor) => {
  const deleted = await RegistrationPriorityWindow.destroy({ where: { id: windowId, semesterId } });
  if (!deleted) throw new NotFoundError('Priority window');
  await audit.log({ userId: actor.id, action: 'priority_window.delete', entityType: 'Semester', entityId: semesterId, metadata: { windowId } });
};

export const listOverrides = async (semesterId) => {
  await loadSemester(semesterId);
  return RegistrationTimeOverride.findAll({
    where: { semesterId },
    include: [{
      model: Student,
      as: 'student',
      attributes: ['id', 'studentNumber', 'level'],
      include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
    }],
    order: [['opensAt', 'ASC'], ['id', 'ASC']],
  });
};

/** Sets (or replaces) one student's registration start time for the semester. */
export const setOverride = async (semesterId, { studentId, opensAt, reason }, actor) => {
  return sequelize.transaction(async (transaction) => {
    const semester = await loadSemester(semesterId, transaction);
    assertWithinRegistration(semester, opensAt);
    const student = await Student.findByPk(studentId, { transaction });
    if (!student) throw new BadRequestError('Student does not exist');

    const existing = await RegistrationTimeOverride.findOne({ where: { studentId, semesterId }, transaction });
    const override = existing
      ? await existing.update({ opensAt, reason, grantedBy: actor.id }, { transaction })
      : await RegistrationTimeOverride.create({ studentId, semesterId, opensAt, reason, grantedBy: actor.id }, { transaction });

    await notificationService.create({
      userId: student.userId,
      type: 'REGISTRATION_TIME',
      title: 'Your registration time was updated',
      message: `You may register for ${semester.name} from ${new Date(opensAt).toISOString()}.`,
      data: { semesterId, opensAt },
    }, { transaction });
    await audit.log({
      userId: actor.id, action: 'registration_time.override', entityType: 'Student', entityId: studentId,
      metadata: { semesterId, opensAt, reason }, transaction,
    });
    return override;
  });
};

export const removeOverride = async (semesterId, studentId, actor) => {
  const deleted = await RegistrationTimeOverride.destroy({ where: { semesterId, studentId } });
  if (!deleted) throw new NotFoundError('Registration time override');
  await audit.log({ userId: actor.id, action: 'registration_time.override_remove', entityType: 'Student', entityId: studentId, metadata: { semesterId } });
};
