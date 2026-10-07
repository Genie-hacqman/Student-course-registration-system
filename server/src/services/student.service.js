import { randomBytes } from 'node:crypto';
import { Op, QueryTypes } from 'sequelize';
import { sequelize, Student, User, Program, Department, Result, Course, Semester } from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../utils/errors.js';
import { assertProgramOpen } from './org-status.service.js';
import * as audit from './audit.service.js';
import { snapshot, diffFields } from '../utils/audit-diff.js';
import * as settingService from './setting.service.js';
import { computeGpa } from '../utils/grades.js';

/** Generated student number, e.g. STU202600123. Derived from the row id, so it's unique without a counter. */
export const buildStudentNumber = (id, year) => `STU${year}${String(id).padStart(5, '0')}`;

/**
 * Inserts a student row. Without an explicit `studentNumber` one is generated from the new row's id,
 * so the row is first inserted with a throwaway unique placeholder and then updated in the same transaction.
 */
export const createStudentRecord = async ({ studentNumber, admissionYear, ...data }, transaction) => {
  const year = admissionYear ?? new Date().getUTCFullYear();
  const student = await Student.create(
    { ...data, admissionYear: year, studentNumber: studentNumber ?? `PENDING-${randomBytes(8).toString('hex')}` },
    { transaction },
  );
  if (!studentNumber) await student.update({ studentNumber: buildStudentNumber(student.id, year) }, { transaction });
  return student;
};

const userInclude = { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'avatarThumb'] };
const programInclude = {
  model: Program,
  as: 'program',
  attributes: ['id', 'name', 'code', 'maxCredits', 'qualificationCode', 'status', 'autoApprove'],
  include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code', 'status'] }],
};

const S = '`Student`.`id`';
const applicationNumber = (id) => `APP${String(id).padStart(6, '0')}`;
const currentSemesterId = async () => (await Semester.findOne({ where: { isCurrent: true }, attributes: ['id'] }))?.id ?? null;

/** A list row: the student plus their registration status for the chosen term and where their admission came from. */
const shapeRow = (row, semesterId) => {
  const { registrationStatus, applicationId, ...student } = row.toJSON();
  return {
    ...student,
    registration: { semesterId, status: registrationStatus ?? null },
    admission: applicationId
      ? { source: 'online', applicationNumber: applicationNumber(applicationId), session: student.admissionSession ?? null }
      : { source: 'staff', applicationNumber: null, session: student.admissionSession ?? null },
  };
};

/**
 * Students, filtered and paginated on the server. A student's department is derived from their programme.
 * `registrationStatus` is for one term (`semesterId`, default the current one): `none` means no registration at all.
 */
export const list = async (query) => {
  const { page, limit, offset, order: baseOrder } = buildPagination(query, ['studentNumber', 'level', 'createdAt']);
  let order = baseOrder;
  if (query.sort === 'name' || query.sort === '-name') {
    const dir = query.sort.startsWith('-') ? 'DESC' : 'ASC';
    order = [[{ model: User, as: 'user' }, 'lastName', dir], [{ model: User, as: 'user' }, 'firstName', dir], ['id', 'ASC']];
  }
  const where = {};
  const and = [];
  if (query.programId) where.programId = query.programId;
  if (query.departmentId) where['$program.department_id$'] = query.departmentId;
  if (query.level) where.level = query.level;
  if (query.status) where.status = query.status;
  if (query.academicHold !== undefined) where.academicHold = query.academicHold;

  const semesterId = query.semesterId ?? await currentSemesterId();
  const sem = semesterId ? sequelize.escape(semesterId) : null;
  if (query.registrationStatus) {
    if (!sem) {
      if (query.registrationStatus !== 'none') and.push(sequelize.literal('1 = 0')); // no term, so nobody has one
    } else if (query.registrationStatus === 'none') {
      and.push(sequelize.literal(`NOT EXISTS (SELECT 1 FROM registrations r WHERE r.student_id = ${S} AND r.semester_id = ${sem})`));
    } else {
      and.push(sequelize.literal(
        `EXISTS (SELECT 1 FROM registrations r WHERE r.student_id = ${S} AND r.semester_id = ${sem} AND r.status = ${sequelize.escape(query.registrationStatus)})`,
      ));
    }
  }
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [
      { studentNumber: { [Op.like]: like } },
      { '$user.first_name$': { [Op.like]: like } },
      { '$user.last_name$': { [Op.like]: like } },
      { '$user.email$': { [Op.like]: like } },
    ];
  }
  if (and.length) where[Op.and] = and;

  const attributes = {
    include: [
      [sequelize.literal(sem ? `(SELECT r.status FROM registrations r WHERE r.student_id = ${S} AND r.semester_id = ${sem})` : 'NULL'), 'registrationStatus'],
      [sequelize.literal(`(SELECT a.id FROM admission_applications a WHERE a.student_id = ${S})`), 'applicationId'],
    ],
  };
  const include = [programInclude, { ...userInclude }];
  const { count, rows } = await Student.findAndCountAll({ where, attributes, include, limit, offset, order, distinct: true, subQuery: false });
  return { result: { count, rows: rows.map((row) => shapeRow(row, semesterId)) }, page, limit };
};

/**
 * How many students each department has, broken down by programme and level, from one GROUP BY over the real rows.
 * Departments and programmes with no students are included with zero. `status` counts only students in that status.
 */
export const summary = async ({ status } = {}) => {
  const rows = await sequelize.query(
    `SELECT d.id AS departmentId, d.code AS departmentCode, d.name AS departmentName, d.status AS departmentStatus,
            p.id AS programId, p.code AS programCode, p.name AS programName, p.status AS programStatus,
            s.level, COUNT(s.id) AS students
       FROM departments d
       LEFT JOIN programs p ON p.department_id = d.id
       LEFT JOIN students s ON s.program_id = p.id ${status ? 'AND s.status = :status' : ''}
      GROUP BY d.id, p.id, s.level
      ORDER BY d.code, p.code, s.level`,
    { replacements: { status: status ?? null }, type: QueryTypes.SELECT },
  );
  const departments = new Map();
  for (const r of rows) {
    if (!departments.has(r.departmentId)) {
      departments.set(r.departmentId, {
        id: r.departmentId, code: r.departmentCode, name: r.departmentName, status: r.departmentStatus, students: 0, programs: new Map(),
      });
    }
    const department = departments.get(r.departmentId);
    if (r.programId === null) continue;
    if (!department.programs.has(r.programId)) {
      department.programs.set(r.programId, { id: r.programId, code: r.programCode, name: r.programName, status: r.programStatus, students: 0, levels: [] });
    }
    const program = department.programs.get(r.programId);
    const n = Number(r.students);
    if (r.level !== null && n > 0) {
      program.levels.push({ level: r.level, students: n });
      program.students += n;
      department.students += n;
    }
  }
  const result = [...departments.values()].map((d) => ({ ...d, programs: [...d.programs.values()] }));
  return { total: result.reduce((sum, d) => sum + d.students, 0), departments: result };
};

const userWithAvatarInclude = { ...userInclude, attributes: [...userInclude.attributes, 'avatar'] };

export const getById = async (id) => {
  const student = await Student.findByPk(id, { include: [userWithAvatarInclude, programInclude] });
  if (!student) throw new NotFoundError('Student');
  return student;
};

/**
 * The student record of a signed-in user, or 403. A STUDENT account without one is an applicant who
 * isn't admitted yet: every student feature (registration, timetable, results, slip) needs admission.
 */
export const getByUserId = async (userId) => {
  const student = await Student.findOne({ where: { userId }, include: [userWithAvatarInclude, programInclude] });
  if (!student) {
    throw new ForbiddenError('Course registration opens once you are admitted and have activated your account', 'ADMISSION_REQUIRED');
  }
  return student;
};

export const create = async (data, actor) => {
  if (!(await User.findByPk(data.userId))) throw new BadRequestError('User does not exist');
  await assertProgramOpen(data.programId);
  if (await Student.findOne({ where: { userId: data.userId }, attributes: ['id'] })) {
    throw new ConflictError('This user already has a student profile');
  }
  const student = await sequelize.transaction(async (transaction) => {
    const created = await createStudentRecord(data, transaction);
    await audit.log({ userId: actor.id, action: 'student.create', entityType: 'Student', entityId: created.id, transaction });
    return created;
  });
  return getById(student.id);
};

export const update = async (id, data, actor) => {
  const student = await getById(id);
  // Moving a student into a programme counts as new intake; staying in an archived one is fine.
  if (data.programId && data.programId !== student.programId) await assertProgramOpen(data.programId);
  const fields = Object.keys(data);
  const before = snapshot(student, fields);
  await sequelize.transaction(async (transaction) => {
    await student.update(data, { transaction });
    await audit.log({
      userId: actor.id, action: 'student.update', entityType: 'Student', entityId: id, transaction,
      metadata: { studentNumber: student.studentNumber, ...diffFields(before, snapshot(student, fields)) },
    });
  });
  return getById(id);
};

/**
 * A student's results plus a GPA summary (final results only, best attempt per course).
 * Students see final results only; staff can include provisional ones.
 */
export const getResults = async (studentId, { finalOnly = true } = {}) => {
  const results = await Result.findAll({
    where: { studentId, ...(finalOnly ? { status: 'final' } : {}) },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits'] },
      { model: Semester, as: 'semester', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'ASC'], ['id', 'ASC']],
  });
  const passingGrade = await settingService.get('grades.passingGrade');
  const summary = computeGpa(
    results.filter((r) => r.status === 'final').map((r) => ({ courseId: r.courseId, grade: r.grade, credits: r.course.credits })),
    passingGrade,
  );
  return { results, summary };
};
