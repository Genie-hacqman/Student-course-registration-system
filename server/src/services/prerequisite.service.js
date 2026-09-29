import { Op } from 'sequelize';
import {
  sequelize, Course, CoursePrerequisite, Result, PrerequisiteOverride, Student, Semester,
  Registration, RegistrationItem,
} from '../models/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { REGISTRATION_ITEM_STATUS } from '../utils/constants.js';
import { meetsGrade } from '../utils/grades.js';
import * as settingService from './setting.service.js';
import * as notificationService from './notification.service.js';
import * as audit from './audit.service.js';

const PREREQUISITE = 'prerequisite';
const COREQUISITE = 'corequisite';

/**
 * True if adding the edge "courseId requires prerequisiteId" would create a cycle,
 * i.e. courseId is already (directly or transitively) a prerequisite of prerequisiteId.
 * `edges` is a list of { courseId, prerequisiteCourseId } (prerequisite-type rows only:
 * corequisites are legitimately mutual, e.g. a lecture and its lab).
 */
export const wouldCreateCycle = (edges, courseId, prerequisiteId) => {
  if (courseId === prerequisiteId) return true;

  const graph = new Map();
  for (const { courseId: from, prerequisiteCourseId: to } of edges) {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from).push(to);
  }

  const stack = [prerequisiteId];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (node === courseId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(graph.get(node) ?? []));
  }
  return false;
};

/** "CS201 (min C)" or "(MATH101 or MATH102)". */
export const describeGroup = ({ anyOf, minGrade }) => {
  const names = anyOf.map((c) => c.code).join(' or ');
  const body = anyOf.length > 1 ? `(${names})` : names;
  return minGrade ? `${body} (min ${minGrade})` : body;
};

/**
 * Pure evaluation of requirement rows for one course.
 * - `rows`: CoursePrerequisite-like { type, groupNo, minGrade, prerequisite: { id, code, title } }
 * - `gradesByCourse`: Map<courseId, string[]> of the student's final grades
 * - `heldCourseIds`: Set of courses the student currently holds this semester (for corequisites)
 * Groups are AND-ed; courses inside a group are OR-ed.
 */
export const evaluateGroups = ({ rows, gradesByCourse, heldCourseIds, passingGrade, overridden = false }) => {
  const groups = new Map();
  for (const row of rows) {
    const key = row.groupNo == null ? `own:${row.id ?? row.prerequisite.id}` : `${row.type}:${row.groupNo}`;
    if (!groups.has(key)) groups.set(key, { type: row.type, minGrade: row.minGrade ?? null, anyOf: [] });
    groups.get(key).anyOf.push({ id: row.prerequisite.id, code: row.prerequisite.code, title: row.prerequisite.title });
  }

  const passedWith = (courseId, minGrade) =>
    (gradesByCourse.get(courseId) ?? []).some((g) => meetsGrade(g, minGrade ?? passingGrade));

  const missing = [];
  const corequisitesMissing = [];
  for (const group of groups.values()) {
    const { type, ...rest } = group;
    if (type === PREREQUISITE) {
      if (!group.anyOf.some((c) => passedWith(c.id, group.minGrade))) missing.push(rest);
    } else if (!group.anyOf.some((c) => heldCourseIds.has(c.id) || passedWith(c.id, null))) {
      corequisitesMissing.push(rest);
    }
  }

  if (overridden) return { missing: [], corequisitesMissing: [], overridden: true };
  return { missing, corequisitesMissing, overridden: false };
};

/**
 * Requirements status for several courses at once (four queries, regardless of how many courses).
 * Returns Map<courseId, { missing: [group], corequisitesMissing: [group], overridden }>.
 */
export const evaluateRequirements = async (studentId, courseIds, { semesterId, heldCourseIds = [], transaction } = {}) => {
  const out = new Map(courseIds.map((id) => [id, { missing: [], corequisitesMissing: [], overridden: false }]));
  if (!courseIds.length) return out;

  const rows = await CoursePrerequisite.findAll({
    where: { courseId: courseIds },
    include: [{ model: Course, as: 'prerequisite', attributes: ['id', 'code', 'title'] }],
    order: [['id', 'ASC']], // groups are reported in the order they were defined
    transaction,
  });
  if (!rows.length) return out;

  const [results, overrides, passingGrade] = await Promise.all([
    Result.findAll({
      where: { studentId, status: 'final', courseId: [...new Set(rows.map((r) => r.prerequisiteCourseId))] },
      attributes: ['courseId', 'grade'],
      transaction,
    }),
    PrerequisiteOverride.findAll({
      where: {
        studentId,
        courseId: courseIds,
        [Op.or]: [{ semesterId: null }, ...(semesterId ? [{ semesterId }] : [])],
      },
      attributes: ['courseId'],
      transaction,
    }),
    settingService.get('grades.passingGrade', { transaction }),
  ]);

  const gradesByCourse = new Map();
  for (const r of results) {
    if (!gradesByCourse.has(r.courseId)) gradesByCourse.set(r.courseId, []);
    gradesByCourse.get(r.courseId).push(r.grade);
  }
  const overridden = new Set(overrides.map((o) => o.courseId));
  const held = new Set(heldCourseIds);

  for (const courseId of courseIds) {
    out.set(courseId, evaluateGroups({
      rows: rows.filter((r) => r.courseId === courseId),
      gradesByCourse,
      heldCourseIds: held,
      passingGrade,
      overridden: overridden.has(courseId),
    }));
  }
  return out;
};

export const evaluateRequirement = async (studentId, courseId, options = {}) =>
  (await evaluateRequirements(studentId, [courseId], options)).get(courseId);

// ── admin: managing requirements ──────────────────────────────────────────────

const findCourse = async (id, label = 'Course', transaction) => {
  const course = await Course.findByPk(id, { transaction });
  if (!course) throw new NotFoundError(label);
  return course;
};

/** Flat list of required courses, each with how it is required (type, group, minimum grade). */
export const list = async (courseId) => {
  const course = await findCourse(courseId);
  const courses = await course.getPrerequisites({
    attributes: ['id', 'code', 'title', 'credits', 'level', 'status'],
    joinTableAttributes: ['type', 'minGrade', 'groupNo'],
  });
  return courses
    .map((c) => {
      const { CoursePrerequisite: link, ...rest } = c.get({ plain: true });
      return { ...rest, type: link.type, minGrade: link.minGrade, groupNo: link.groupNo };
    })
    .sort((a, b) => (a.groupNo ?? 0) - (b.groupNo ?? 0) || a.code.localeCompare(b.code));
};

/**
 * Adds one requirement group: a single course, or alternatives ("anyOf": any one satisfies it).
 * Body: { prerequisiteCourseId } | { anyOf: [ids], minGrade?, type? }.
 */
/**
 * Adds one requirement group inside the caller's transaction. Shared by `add` and the bulk import.
 * `courseIds` are the alternatives (any one satisfies the group).
 */
export const addGroup = async (courseId, { courseIds, type = PREREQUISITE, minGrade = null }, actor, transaction) => {
  courseIds = [...new Set(courseIds)];
  if (type === COREQUISITE && minGrade) throw new BadRequestError('Corequisites cannot have a minimum grade');
  if (courseIds.includes(courseId)) throw new BadRequestError('A course cannot be its own prerequisite');

  await findCourse(courseId, 'Course', transaction);
  for (const id of courseIds) await findCourse(id, 'Prerequisite course', transaction);

  const existing = await CoursePrerequisite.findAll({ where: { courseId, prerequisiteCourseId: courseIds }, transaction });
  if (existing.length) throw new ConflictError('One of these courses is already a requirement of this course');

  if (type === PREREQUISITE) {
    const edges = await CoursePrerequisite.findAll({
      where: { type: PREREQUISITE },
      attributes: ['courseId', 'prerequisiteCourseId'],
      raw: true,
      transaction,
    });
    if (courseIds.some((id) => wouldCreateCycle(edges, courseId, id))) {
      throw new BadRequestError('Adding this prerequisite would create a circular dependency');
    }
  }

  // A single course is its own group (null); alternatives share a new group number.
  const groupNo = courseIds.length > 1
    ? ((await CoursePrerequisite.max('groupNo', { where: { courseId }, transaction })) ?? 0) + 1
    : null;
  await CoursePrerequisite.bulkCreate(
    courseIds.map((id) => ({ courseId, prerequisiteCourseId: id, type, minGrade, groupNo })),
    { transaction },
  );
  await audit.log({
    userId: actor.id, action: 'prerequisite.add', entityType: 'Course', entityId: courseId,
    metadata: { type, anyOf: courseIds, minGrade }, transaction,
  });
};

/**
 * Adds one requirement group: a single course, or alternatives ("anyOf": any one satisfies it).
 * Body: { prerequisiteCourseId } | { anyOf: [ids], minGrade?, type? }.
 */
export const add = async (courseId, body, actor) => {
  await sequelize.transaction((transaction) => addGroup(courseId, {
    courseIds: body.anyOf ?? [body.prerequisiteCourseId],
    type: body.type ?? PREREQUISITE,
    minGrade: body.minGrade ?? null,
  }, actor, transaction));
  return list(courseId);
};

/** `prerequisiteId` is the id of the required course; it is removed from whichever group it is in. */
export const remove = async (courseId, prerequisiteId, actor) => {
  const deleted = await CoursePrerequisite.destroy({ where: { courseId, prerequisiteCourseId: prerequisiteId } });
  if (!deleted) throw new NotFoundError('Prerequisite');
  await audit.log({
    userId: actor.id, action: 'prerequisite.remove', entityType: 'Course', entityId: courseId, metadata: { prerequisiteId },
  });
};

// ── student-facing check ──────────────────────────────────────────────────────

const currentHeldCourseIds = async (studentId) => {
  const semester = await Semester.findOne({ where: { isCurrent: true }, attributes: ['id'] });
  if (!semester) return { semesterId: null, held: [] };
  const items = await RegistrationItem.findAll({
    where: { status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [{ model: Registration, as: 'registration', where: { studentId, semesterId: semester.id }, attributes: [] }],
    attributes: ['courseId'],
  });
  return { semesterId: semester.id, held: items.map((i) => i.courseId) };
};

export const flattenGroups = (groups) => {
  const seen = new Map();
  for (const g of groups) for (const c of g.anyOf) seen.set(c.id, c);
  return [...seen.values()];
};

export const check = async (studentId, courseId) => {
  await findCourse(courseId);
  const { semesterId, held } = await currentHeldCourseIds(studentId);
  const result = await evaluateRequirement(studentId, courseId, { semesterId, heldCourseIds: held });
  return {
    courseId,
    qualified: result.missing.length === 0,
    overridden: result.overridden,
    missing: flattenGroups(result.missing),
    groups: result.missing.map((g) => ({ ...g, description: describeGroup(g) })),
    corequisites: result.corequisitesMissing.map((g) => ({ ...g, description: describeGroup(g) })),
  };
};

// ── overrides (registrar) ───────────────────────────────────────────

const overrideIncludes = [
  { model: Course, as: 'course', attributes: ['id', 'code', 'title'] },
  { model: Semester, as: 'semester', attributes: ['id', 'name'] },
];

export const listOverrides = async (studentId) => {
  if (!(await Student.findByPk(studentId))) throw new NotFoundError('Student');
  return PrerequisiteOverride.findAll({ where: { studentId }, include: overrideIncludes, order: [['createdAt', 'DESC']] });
};

/** Waives a course's requirements for one student (in one semester, or permanently when semesterId is omitted). */
export const grantOverride = async (studentId, { courseId, semesterId = null, reason }, actor, req) => {
  const override = await sequelize.transaction(async (transaction) => {
    const student = await Student.findByPk(studentId, { transaction });
    if (!student) throw new NotFoundError('Student');
    const course = await findCourse(courseId, 'Course', transaction);
    if (semesterId && !(await Semester.findByPk(semesterId, { transaction }))) throw new BadRequestError('Semester does not exist');

    const duplicate = await PrerequisiteOverride.findOne({ where: { studentId, courseId, semesterId }, transaction });
    if (duplicate) throw new ConflictError('This student already has an override for this course');

    const created = await PrerequisiteOverride.create({ studentId, courseId, semesterId, reason, grantedBy: actor.id }, { transaction });
    await notificationService.create({
      userId: student.userId,
      type: 'PREREQUISITE_OVERRIDE',
      title: `Prerequisites waived for ${course.code}`,
      message: `You may now register for ${course.code} — ${course.title} without its usual prerequisites.`,
      data: { courseId, overrideId: created.id },
    }, { transaction });
    await audit.log({
      userId: actor.id, action: 'prerequisite.override_grant', entityType: 'Student', entityId: studentId,
      metadata: { courseId, semesterId, reason }, req, transaction,
    });
    return created;
  });
  return PrerequisiteOverride.findByPk(override.id, { include: overrideIncludes });
};

export const revokeOverride = async (studentId, overrideId, actor, req) => {
  const deleted = await PrerequisiteOverride.destroy({ where: { id: overrideId, studentId } });
  if (!deleted) throw new NotFoundError('Override');
  await audit.log({
    userId: actor.id, action: 'prerequisite.override_revoke', entityType: 'Student', entityId: studentId,
    metadata: { overrideId }, req,
  });
};
