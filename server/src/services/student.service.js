import { randomBytes } from 'node:crypto';
import { Op } from 'sequelize';
import { Student, User, Program, Department, Result, Course, Semester } from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError, ForbiddenError, ConflictError } from '../utils/errors.js';
import * as audit from './audit.service.js';
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

const userInclude = { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] };
const programInclude = {
  model: Program,
  as: 'program',
  attributes: ['id', 'name', 'code', 'maxCredits', 'qualificationCode'],
  include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
};

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['studentNumber', 'level', 'createdAt']);
  const where = {};
  if (query.programId) where.programId = query.programId;
  if (query.level) where.level = query.level;
  if (query.status) where.status = query.status;

  const include = [programInclude, { ...userInclude }];
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [
      { studentNumber: { [Op.like]: like } },
      { '$user.first_name$': { [Op.like]: like } },
      { '$user.last_name$': { [Op.like]: like } },
      { '$user.email$': { [Op.like]: like } },
    ];
  }

  const result = await Student.findAndCountAll({ where, include, limit, offset, order, distinct: true, subQuery: false });
  return { result, page, limit };
};

export const getById = async (id) => {
  const student = await Student.findByPk(id, { include: [userInclude, programInclude] });
  if (!student) throw new NotFoundError('Student');
  return student;
};

/** Returns the student profile for a logged-in user, or throws 403 if the user is not a student. */
export const getByUserId = async (userId) => {
  const student = await Student.findOne({ where: { userId }, include: [userInclude, programInclude] });
  if (!student) throw new ForbiddenError('Only students can perform this action');
  return student;
};

export const create = async (data, actor) => {
  if (!(await User.findByPk(data.userId))) throw new BadRequestError('User does not exist');
  if (!(await Program.findByPk(data.programId))) throw new BadRequestError('Program does not exist');
  if (await Student.findOne({ where: { userId: data.userId }, attributes: ['id'] })) {
    throw new ConflictError('This user already has a student profile');
  }
  const student = await createStudentRecord(data);
  await audit.log({ userId: actor.id, action: 'student.create', entityType: 'Student', entityId: student.id });
  return getById(student.id);
};

export const update = async (id, data, actor) => {
  const student = await getById(id);
  if (data.programId && !(await Program.findByPk(data.programId))) throw new BadRequestError('Program does not exist');
  await student.update(data);
  await audit.log({ userId: actor.id, action: 'student.update', entityType: 'Student', entityId: id, metadata: data });
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
