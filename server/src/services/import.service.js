import { Op } from 'sequelize';
import {
  sequelize, User, Role, Lecturer, Department, Program, Course, ProgramCourse, CoursePrerequisite,
  CourseSection, Semester, Schedule,
} from '../models/index.js';
import { BadRequestError, ConflictError } from '../utils/errors.js';
import { COURSE_STATUS, ROLES, SECTION_STATUS, USER_STATUS } from '../utils/constants.js';
import { UNUSABLE_PASSWORD_HASH } from '../utils/password.js';
import { slotsOverlap } from '../utils/time.js';
import { addGroup } from './prerequisite.service.js';
import { findConflicts } from './schedule.service.js';
import { issueInvite } from './password-reset.service.js';
import * as waitlistService from './waitlist.service.js';
import * as audit from './audit.service.js';

/*
 * Bulk import of real institutional data. Each endpoint takes rows keyed by natural keys (codes,
 * emails, staff numbers) and upserts them, so re-running a corrected file is safe.
 *
 * - Every row runs in its own transaction: a bad row is reported and the rest still import.
 * - A dry run wraps the whole file in one outer transaction, runs each row in a savepoint and then
 *   rolls everything back. Later rows therefore see earlier ones (a section clashing with another
 *   section in the same file is caught), exactly as in the real run.
 * - Savepoints fire `afterCommit` hooks immediately, so anything with side effects outside the
 *   database (invite emails, waitlist notifications) is skipped when `ctx.dryRun` is set.
 */

const DRY_RUN_ROLLBACK = Symbol('dry-run rollback');

const describeError = (err) => {
  if (err.name === 'SequelizeUniqueConstraintError') {
    return { message: `Duplicate value: ${err.errors?.map((e) => `${e.path} "${e.value}"`).join(', ') || 'unique constraint'}` };
  }
  if (err.name === 'SequelizeForeignKeyConstraintError') return { message: 'Refers to a record that does not exist' };
  return { message: err.message, ...(err.details ? { details: err.details } : {}) };
};

/**
 * Runs `handler(row, transaction, ctx)` for every row. The handler returns 'created', 'updated'
 * or 'unchanged', optionally with `invite` (a user to email after the row commits) or
 * `credentials` (returned once in the report; never for a dry run, whose rows are rolled back).
 */
export const runImport = async ({ rows, dryRun = false, sendInvites = false }, handler, { actor, action, keyOf, withCredentials = false }) => {
  const report = {
    dryRun, created: 0, updated: 0, unchanged: 0, failed: 0, invited: 0, errors: [], ...(withCredentials && !dryRun ? { credentials: [] } : {}),
  };
  const ctx = { actor, dryRun, cache: new Map() };
  const invites = [];

  const runRows = async (outer) => {
    for (const [index, row] of rows.entries()) {
      try {
        const { outcome, invite, credentials } = await sequelize.transaction({ transaction: outer }, (t) => handler(row, t, ctx));
        report[outcome] += 1;
        if (invite) invites.push(invite);
        if (credentials && report.credentials) report.credentials.push({ row: index, ...credentials });
      } catch (err) {
        report.failed += 1;
        report.errors.push({ row: index, key: keyOf(row), ...describeError(err) });
      }
    }
  };

  if (dryRun) {
    try {
      await sequelize.transaction(async (outer) => {
        await runRows(outer);
        throw DRY_RUN_ROLLBACK;
      });
    } catch (err) {
      if (err !== DRY_RUN_ROLLBACK) throw err;
    }
    return report;
  }

  await runRows(undefined);
  if (sendInvites) {
    for (const user of invites) await issueInvite(user, { actor });
    report.invited = invites.length;
  }
  await audit.log({
    userId: actor.id,
    action,
    metadata: { created: report.created, updated: report.updated, unchanged: report.unchanged, failed: report.failed, invited: report.invited },
  });
  return report;
};

// ── lookups by natural key ────────────────────────────────────────────────────

const findByCode = async (Model, label, code, transaction) => {
  const record = await Model.findOne({ where: { code }, transaction });
  if (!record) throw new BadRequestError(`Unknown ${label} code ${code}`);
  return record;
};

/** Omitted (undefined) fields mean "leave as is" on an upsert. */
const stripUndefined = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Applies `changes` and reports whether anything actually differed. */
const applyUpdate = async (record, changes, transaction) => {
  record.set(stripUndefined(changes));
  if (!record.changed()) return 'unchanged';
  await record.save({ transaction });
  return 'updated';
};

const roleId = async (name, ctx, transaction) => {
  const key = `role:${name}`;
  if (!ctx.cache.has(key)) {
    const role = await Role.findOne({ where: { name }, transaction });
    if (!role) throw new BadRequestError(`Role ${name} is missing — run the essential seed first`);
    ctx.cache.set(key, role.id);
  }
  return ctx.cache.get(key);
};

// ── academic structure ────────────────────────────────────────────────────────

export const importDepartments = (body, actor) => runImport(body, async (row, transaction) => {
  const existing = await Department.findOne({ where: { code: row.code }, transaction });
  if (existing) return { outcome: await applyUpdate(existing, { name: row.name }, transaction) };
  await Department.create(row, { transaction });
  return { outcome: 'created' };
}, { actor, action: 'import.departments', keyOf: (r) => r.code });

export const importPrograms = (body, actor) => runImport(body, async (row, transaction) => {
  const department = await findByCode(Department, 'department', row.departmentCode, transaction);
  const fields = {
    name: row.name, departmentId: department.id, durationYears: row.durationYears, maxCredits: row.maxCredits, qualificationCode: row.qualificationCode,
  };
  const existing = await Program.findOne({ where: { code: row.code }, transaction });
  if (existing) return { outcome: await applyUpdate(existing, fields, transaction) };
  await Program.create({ durationYears: 4, maxCredits: 24, ...stripUndefined(fields), code: row.code }, { transaction });
  return { outcome: 'created' };
}, { actor, action: 'import.programs', keyOf: (r) => r.code });

export const importCourses = (body, actor) => runImport(body, async (row, transaction) => {
  const department = await findByCode(Department, 'department', row.departmentCode, transaction);
  const fields = {
    title: row.title, departmentId: department.id, description: row.description, credits: row.credits, level: row.level, status: row.status,
  };
  const existing = await Course.findOne({ where: { code: row.code }, transaction });
  if (existing) return { outcome: await applyUpdate(existing, fields, transaction) };
  await Course.create({ status: COURSE_STATUS.ACTIVE, ...stripUndefined(fields), code: row.code }, { transaction });
  return { outcome: 'created' };
}, { actor, action: 'import.courses', keyOf: (r) => r.code });

export const importProgramCourses = (body, actor) => runImport(body, async (row, transaction) => {
  const program = await findByCode(Program, 'program', row.programCode, transaction);
  const course = await findByCode(Course, 'course', row.courseCode, transaction);
  const existing = await ProgramCourse.findOne({ where: { programId: program.id, courseId: course.id }, transaction });
  if (existing) {
    return { outcome: await applyUpdate(existing, { type: row.type, recommendedLevel: row.recommendedLevel }, transaction) };
  }
  await ProgramCourse.create({
    programId: program.id, courseId: course.id, type: row.type ?? 'core', recommendedLevel: row.recommendedLevel ?? course.level,
  }, { transaction });
  return { outcome: 'created' };
}, { actor, action: 'import.program_courses', keyOf: (r) => `${r.programCode}/${r.courseCode}` });

/**
 * One row is one requirement group. A group that already exists exactly as given is left alone,
 * so re-importing is safe; one that overlaps an existing group differently is an error (fix it by hand).
 */
export const importPrerequisites = (body, actor) => runImport(body, async (row, transaction, ctx) => {
  const course = await findByCode(Course, 'course', row.courseCode, transaction);
  const required = [];
  for (const c of new Set(row.requiresAnyOf)) required.push(await findByCode(Course, 'course', c, transaction));
  const requiredIds = required.map((c) => c.id);

  const existing = await CoursePrerequisite.findAll({ where: { courseId: course.id, prerequisiteCourseId: requiredIds }, transaction });
  if (existing.length) {
    const groupKey = (r) => (r.groupNo == null ? `own:${r.id}` : `${r.type}:${r.groupNo}`);
    const group = existing[0].groupNo == null
      ? existing
      : await CoursePrerequisite.findAll({ where: { courseId: course.id, type: existing[0].type, groupNo: existing[0].groupNo }, transaction });
    const same = new Set(existing.map(groupKey)).size === 1
      && group.length === requiredIds.length
      && existing[0].type === row.type
      && (existing[0].minGrade ?? null) === (row.minGrade ?? null);
    if (same) return { outcome: 'unchanged' };
    throw new ConflictError('These courses are already part of a different requirement of this course; change it by hand');
  }

  await addGroup(course.id, { courseIds: requiredIds, type: row.type, minGrade: row.minGrade ?? null }, ctx.actor, transaction);
  return { outcome: 'created' };
}, { actor, action: 'import.prerequisites', keyOf: (r) => `${r.courseCode} <- ${r.requiresAnyOf.join('|')}` });

// ── people ────────────────────────────────────────────────────────────────────

/**
 * Finds the account by email or creates it without a usable password. Returns the user, whether it
 * was created, and whether it still needs an invite (never set a password).
 */
const upsertUser = async (row, role, ctx, transaction) => {
  const user = await User.scope('withSecrets').findOne({
    where: { email: row.email }, include: [{ model: Role, as: 'role', attributes: ['name'] }], transaction,
  });
  if (user) {
    if (user.role.name !== role) throw new ConflictError(`${row.email} already belongs to a ${user.role.name} account`);
    const outcome = await applyUpdate(user, { firstName: row.firstName, lastName: row.lastName }, transaction);
    const needsInvite = user.passwordHash === UNUSABLE_PASSWORD_HASH && user.status === USER_STATUS.ACTIVE;
    return { user, created: false, outcome, needsInvite };
  }
  const created = await User.create({
    roleId: await roleId(role, ctx, transaction),
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    passwordHash: UNUSABLE_PASSWORD_HASH,
    status: USER_STATUS.ACTIVE,
    // Staff import records for real people they know, so no verification email is needed.
    emailVerifiedAt: new Date(),
  }, { transaction });
  return { user: created, created: true, outcome: 'created', needsInvite: true };
};

/** A new account is 'created'; otherwise 'updated' if the user row changed or its profile was added or changed. */
const combine = (account, profileOutcome) => {
  if (account.created) return 'created';
  return account.outcome === 'updated' || profileOutcome !== 'unchanged' ? 'updated' : 'unchanged';
};

export const importLecturers = (body, actor) => runImport(body, async (row, transaction, ctx) => {
  const department = await findByCode(Department, 'department', row.departmentCode, transaction);
  const account = await upsertUser(row, ROLES.LECTURER, ctx, transaction);
  const fields = { departmentId: department.id, staffNumber: row.staffNumber, title: row.title };

  const lecturer = await Lecturer.findOne({ where: { userId: account.user.id }, transaction });
  let profileOutcome = 'created';
  if (lecturer) profileOutcome = await applyUpdate(lecturer, fields, transaction);
  else await Lecturer.create({ ...stripUndefined(fields), userId: account.user.id }, { transaction });

  return { outcome: combine(account, profileOutcome), invite: account.needsInvite ? account.user : undefined };
}, { actor, action: 'import.lecturers', keyOf: (r) => r.email });

// ── sections and timetable ────────────────────────────────────────────────────

const resolveSemesterId = async (row, ctx, transaction) => {
  if (row.semesterId) {
    if (!(await Semester.findByPk(row.semesterId, { transaction }))) throw new BadRequestError(`Unknown semester ${row.semesterId}`);
    return row.semesterId;
  }
  if (!ctx.cache.has('currentSemester')) {
    const current = await Semester.findOne({ where: { isCurrent: true }, attributes: ['id'], transaction });
    ctx.cache.set('currentSemester', current?.id ?? null);
  }
  const currentId = ctx.cache.get('currentSemester');
  if (!currentId) throw new BadRequestError('No current semester; set semesterId or mark a semester as current');
  return currentId;
};

export const importSections = (body, actor) => runImport(body, async (row, transaction, ctx) => {
  const course = await findByCode(Course, 'course', row.courseCode, transaction);
  const semesterId = await resolveSemesterId(row, ctx, transaction);

  let lecturerId;
  if (row.lecturerStaffNumber === null) lecturerId = null;
  else if (row.lecturerStaffNumber) {
    const lecturer = await Lecturer.findOne({ where: { staffNumber: row.lecturerStaffNumber }, transaction });
    if (!lecturer) throw new BadRequestError(`Unknown lecturer staff number ${row.lecturerStaffNumber}`);
    lecturerId = lecturer.id;
  }

  const fields = { capacity: row.capacity, lecturerId, status: row.status, waitlistEnabled: row.waitlistEnabled };
  let section = await CourseSection.findOne({
    where: { courseId: course.id, semesterId, sectionCode: row.sectionCode }, transaction, lock: transaction.LOCK.UPDATE,
  });

  let outcome;
  let capacityGrewBy = 0;
  if (section) {
    if (row.capacity < section.seatsTaken) {
      throw new BadRequestError(`Capacity cannot be below the ${section.seatsTaken} seats already taken`);
    }
    capacityGrewBy = row.capacity > section.capacity ? row.capacity - section.seatsTaken : 0;
    outcome = await applyUpdate(section, fields, transaction);
  } else {
    if (course.status !== COURSE_STATUS.ACTIVE) throw new BadRequestError(`Cannot open a section for inactive course ${course.code}`);
    section = await CourseSection.create({
      status: SECTION_STATUS.OPEN, waitlistEnabled: true, ...stripUndefined(fields),
      courseId: course.id, semesterId, sectionCode: row.sectionCode, seatsTaken: 0,
    }, { transaction });
    outcome = 'created';
  }

  // Timetable: replaced when given; otherwise the existing slots are re-checked against a new lecturer.
  const slots = row.schedules
    ?? (await Schedule.findAll({ where: { courseSectionId: section.id }, raw: true, transaction })).map(({ room, ...s }) => s);
  if (row.schedules) {
    for (const [i, a] of slots.entries()) {
      if (slots.slice(i + 1).some((b) => slotsOverlap(a, b))) throw new ConflictError('Two of this section\'s slots overlap');
    }
  }
  if (row.schedules || lecturerId) {
    const conflicts = await findConflicts({
      semesterId, lecturerId: section.lecturerId, slots, excludeSectionId: section.id, transaction,
    });
    if (conflicts.length) throw new ConflictError('Schedule conflicts with existing classes', conflicts);
  }
  if (row.schedules) {
    const current = await Schedule.findAll({ where: { courseSectionId: section.id }, order: [['id', 'ASC']], raw: true, transaction });
    const norm = (s) => `${s.day} ${s.startTime} ${s.endTime} ${(s.room ?? '').toLowerCase()}`;
    const same = current.length === slots.length && current.map(norm).sort().join('|') === slots.map(norm).sort().join('|');
    if (!same) {
      await Schedule.destroy({ where: { courseSectionId: section.id }, transaction });
      await Schedule.bulkCreate(slots.map((s) => ({ ...s, courseSectionId: section.id })), { transaction });
      if (outcome === 'unchanged') outcome = 'updated';
    }
  }

  // More seats on a live section: tell the waitlist, as a manual capacity change would.
  if (capacityGrewBy > 0 && !ctx.dryRun) {
    await waitlistService.notifyNext(section, { transaction, count: capacityGrewBy });
  }
  return { outcome };
}, { actor, action: 'import.sections', keyOf: (r) => `${r.courseCode}/${r.sectionCode}` });

// ── invites ───────────────────────────────────────────────────────────────────

/**
 * Emails a set-your-password invite to imported accounts that have never set one and have no
 * unexpired invite outstanding. Sent in batches of `limit`; call again while `remaining` > 0.
 */
export const sendPendingInvites = async ({ role, limit }, actor) => {
  const where = {
    passwordHash: UNUSABLE_PASSWORD_HASH,
    status: USER_STATUS.ACTIVE,
    [Op.or]: [{ passwordResetExpires: null }, { passwordResetExpires: { [Op.lt]: new Date() } }],
  };
  const include = [{ model: Role, as: 'role', attributes: [], ...(role ? { where: { name: role } } : {}) }];

  const users = await User.findAll({ where, include, attributes: ['id', 'email', 'firstName'], order: [['id', 'ASC']], limit });
  for (const user of users) await issueInvite(user, { actor });
  const remaining = await User.count({ where, include });

  await audit.log({ userId: actor.id, action: 'import.invites', metadata: { sent: users.length, remaining, role: role ?? null } });
  return { sent: users.length, remaining };
};
