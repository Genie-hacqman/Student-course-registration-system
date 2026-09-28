import {
  sequelize, Result, CourseSection, Course, Semester, Student, User, Registration, RegistrationItem,
} from '../models/index.js';
import {
  NotFoundError, ForbiddenError, ConflictError, BadRequestError, ValidationError,
} from '../utils/errors.js';
import {
  REGISTRATION_ITEM_STATUS, REGISTRATION_STATUS, PERMISSIONS, ROLES,
} from '../utils/constants.js';
import {
  normalizeGrade, isValidGrade, gradePoint, isPassing, GRADES,
} from '../utils/grades.js';
import { hasPermission } from '../middleware/permission.middleware.js';
import * as lecturerService from './lecturer.service.js';
import * as settingService from './setting.service.js';
import * as notificationService from './notification.service.js';
import * as audit from './audit.service.js';

const passingGrade = (transaction) => settingService.get('grades.passingGrade', { transaction });

const gradeFields = async (grade, transaction) => {
  const letter = normalizeGrade(grade);
  if (!isValidGrade(letter)) throw new ValidationError(`Unknown grade "${grade}". Use one of: ${GRADES.join(', ')}`);
  return { grade: letter, gradePoint: gradePoint(letter), passed: isPassing(letter, await passingGrade(transaction)) };
};

/** Lecturers may only grade sections they teach; registrar/admin (GRADE_MANAGE) may grade any. */
const assertCanGrade = async (section, actor) => {
  if (hasPermission(actor.role, PERMISSIONS.GRADE_MANAGE)) return;
  if (actor.role === ROLES.LECTURER) {
    const lecturer = await lecturerService.getByUserId(actor.id);
    if (section.lecturerId === lecturer.id) return;
    throw new ForbiddenError('You do not teach this section');
  }
  throw new ForbiddenError();
};

const loadSection = async (sectionId, transaction, lock = false) => {
  const section = await CourseSection.findByPk(sectionId, {
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!section) throw new NotFoundError('Section');
  return section;
};

/** Students with a registered item in this section whose registration is approved. */
const loadRoster = (sectionId, transaction) =>
  RegistrationItem.findAll({
    where: { courseSectionId: sectionId, status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [{
      model: Registration,
      as: 'registration',
      where: { status: REGISTRATION_STATUS.APPROVED },
      attributes: ['id', 'studentId'],
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'userId', 'studentNumber', 'level'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      }],
    }],
    transaction,
  }).then((items) => items.map((i) => i.registration.student));

const sectionResults = (section, studentIds, transaction) =>
  Result.findAll({
    where: { studentId: studentIds, courseId: section.courseId, semesterId: section.semesterId },
    transaction,
  });

const isFinalized = async (section, transaction) =>
  (await Result.count({ where: { courseSectionId: section.id, status: 'final' }, transaction })) > 0;

export const getSectionGrades = async (sectionId, actor) => {
  const section = await loadSection(sectionId);
  await assertCanGrade(section, actor);
  const course = await Course.findByPk(section.courseId, { attributes: ['id', 'code', 'title', 'credits'] });

  const roster = await loadRoster(section.id);
  const results = await sectionResults(section, roster.map((s) => s.id));
  const byStudent = new Map(results.map((r) => [r.studentId, r]));

  return {
    section: { id: section.id, sectionCode: section.sectionCode, semesterId: section.semesterId, course },
    finalized: await isFinalized(section),
    students: roster.map((s) => {
      const r = byStudent.get(s.id);
      return {
        studentId: s.id,
        studentNumber: s.studentNumber,
        name: `${s.user.firstName} ${s.user.lastName}`,
        grade: r?.grade ?? null,
        status: r?.status ?? null,
      };
    }),
  };
};

/** Saves provisional grades. Can be called repeatedly until the section is finalised. */
export const enterGrades = async (sectionId, grades, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const section = await loadSection(sectionId, transaction, true);
    await assertCanGrade(section, actor);
    if (await isFinalized(section, transaction)) {
      throw new ConflictError('Grades for this section are final; ask the registrar to amend a result');
    }

    const rosterIds = new Set((await loadRoster(section.id, transaction)).map((s) => s.id));
    const notOnRoster = grades.filter((g) => !rosterIds.has(g.studentId)).map((g) => g.studentId);
    if (notOnRoster.length) {
      throw new BadRequestError('Some students are not registered (approved) in this section', { studentIds: notOnRoster });
    }

    const existing = new Map((await sectionResults(section, grades.map((g) => g.studentId), transaction)).map((r) => [r.studentId, r]));
    for (const { studentId, grade } of grades) {
      const fields = {
        ...(await gradeFields(grade, transaction)),
        status: 'provisional',
        courseSectionId: section.id,
        enteredBy: actor.id,
      };
      const current = existing.get(studentId);
      if (current?.status === 'final') throw new ConflictError(`Student ${studentId} already has a final result for this course`);
      if (current) await current.update(fields, { transaction });
      else await Result.create({ studentId, courseId: section.courseId, semesterId: section.semesterId, ...fields }, { transaction });
    }

    await audit.log({
      userId: actor.id, action: 'grades.enter', entityType: 'CourseSection', entityId: section.id,
      metadata: { count: grades.length }, req, transaction,
    });
  });
  return getSectionGrades(sectionId, actor);
};

/** Publishes the section's grades. Every rostered student must have a grade first. */
export const finalizeGrades = async (sectionId, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const section = await loadSection(sectionId, transaction, true);
    await assertCanGrade(section, actor);
    if (await isFinalized(section, transaction)) throw new ConflictError('Grades for this section are already final');

    const roster = await loadRoster(section.id, transaction);
    if (!roster.length) throw new BadRequestError('No approved students are registered in this section');
    const results = await sectionResults(section, roster.map((s) => s.id), transaction);
    const graded = new Set(results.map((r) => r.studentId));
    const ungraded = roster.filter((s) => !graded.has(s.id));
    if (ungraded.length) {
      throw new ValidationError('Every student needs a grade before finalising', ungraded.map((s) => ({
        studentId: s.id, studentNumber: s.studentNumber, message: 'No grade entered',
      })));
    }

    const finalizedAt = new Date();
    await Result.update(
      { status: 'final', finalizedAt, courseSectionId: section.id },
      { where: { id: results.map((r) => r.id) }, transaction },
    );

    const course = await Course.findByPk(section.courseId, { attributes: ['code', 'title'], transaction });
    for (const student of roster) {
      await notificationService.create({
        userId: student.userId,
        type: 'GRADES_RELEASED',
        title: `Grade released for ${course.code}`,
        message: `Your final grade for ${course.code} — ${course.title} is now available.`,
        data: { courseSectionId: section.id, courseId: section.courseId },
      }, { transaction });
    }
    await audit.log({
      userId: actor.id, action: 'grades.finalize', entityType: 'CourseSection', entityId: section.id,
      metadata: { students: roster.length }, req, transaction,
    });
  });
  return getSectionGrades(sectionId, actor);
};

/** Registrar correction of any result, with a mandatory reason kept in the audit log. */
export const amendResult = async (resultId, { grade, reason }, actor, req) => {
  return sequelize.transaction(async (transaction) => {
    const result = await Result.findByPk(resultId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!result) throw new NotFoundError('Result');

    const previous = result.grade;
    await result.update({ ...(await gradeFields(grade, transaction)), enteredBy: actor.id }, { transaction });

    if (result.status === 'final') {
      const student = await Student.findByPk(result.studentId, { attributes: ['userId'], transaction });
      const course = await Course.findByPk(result.courseId, { attributes: ['code'], transaction });
      await notificationService.create({
        userId: student.userId,
        type: 'GRADE_AMENDED',
        title: `Grade updated for ${course.code}`,
        message: `Your grade for ${course.code} was changed from ${previous} to ${result.grade}.`,
        data: { resultId: result.id },
      }, { transaction });
    }
    await audit.log({
      userId: actor.id, action: 'result.amend', entityType: 'Result', entityId: result.id,
      metadata: { from: previous, to: result.grade, reason }, req, transaction,
    });
    return result;
  });
};

/**
 * Bulk import of official (final) results — history from a previous system or transfer credit.
 * Each row is processed independently; bad rows are reported, good rows are saved.
 */
export const importResults = async (rows, actor, req) => {
  const errors = [];
  let imported = 0;

  for (const [index, row] of rows.entries()) {
    try {
      await sequelize.transaction(async (transaction) => {
        const student = await Student.findOne({ where: { studentNumber: row.studentNumber }, transaction });
        if (!student) throw new BadRequestError(`Unknown student number ${row.studentNumber}`);
        const course = await Course.findOne({ where: { code: row.courseCode.toUpperCase() }, transaction });
        if (!course) throw new BadRequestError(`Unknown course code ${row.courseCode}`);
        if (row.semesterId && !(await Semester.findByPk(row.semesterId, { transaction }))) {
          throw new BadRequestError(`Unknown semester ${row.semesterId}`);
        }

        const fields = {
          ...(await gradeFields(row.grade, transaction)),
          status: 'final',
          finalizedAt: new Date(),
          enteredBy: actor.id,
        };
        const where = { studentId: student.id, courseId: course.id, semesterId: row.semesterId ?? null };
        const existing = await Result.findOne({ where, transaction });
        if (existing) await existing.update(fields, { transaction });
        else await Result.create({ ...where, ...fields }, { transaction });
      });
      imported += 1;
    } catch (err) {
      errors.push({ row: index, studentNumber: row.studentNumber, courseCode: row.courseCode, message: err.message });
    }
  }

  await audit.log({
    userId: actor.id, action: 'results.import', entityType: 'Result', metadata: { imported, failed: errors.length }, req,
  });
  return { imported, failed: errors.length, errors };
};
