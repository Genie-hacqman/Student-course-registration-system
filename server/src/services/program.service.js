import { Op } from 'sequelize';
import { Program, Department, Course, ProgramCourse, AcademicYear } from '../models/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import { ORG_STATUS } from '../utils/constants.js';
import * as audit from './audit.service.js';
import { assertDepartmentOpen } from './org-status.service.js';

const include = [{ model: Department, as: 'department', attributes: ['id', 'name', 'code', 'status'] }];

/** Programmes with their department; `status` and `search` narrow it (e.g. `status=active` for pickers). */
export const list = ({ departmentId, status, search } = {}) => {
  const where = {};
  if (departmentId) where.departmentId = departmentId;
  if (status) where.status = status;
  if (search) where[Op.or] = [{ name: { [Op.like]: `%${search}%` } }, { code: { [Op.like]: `%${search}%` } }];
  return Program.findAll({ where, include, order: [['code', 'ASC']] });
};

export const getById = async (id) => {
  const program = await Program.findByPk(id, { include });
  if (!program) throw new NotFoundError('Program');
  return program;
};

export const create = async (data, actor, req) => {
  await assertDepartmentOpen(data.departmentId, { what: 'new programmes' });
  const program = await Program.create(data);
  await audit.log({ userId: actor.id, action: 'program.create', entityType: 'Program', entityId: program.id, metadata: { code: program.code }, req });
  return getById(program.id);
};

export const update = async (id, data, actor, req) => {
  const program = await getById(id);
  if (data.departmentId && data.departmentId !== program.departmentId) {
    await assertDepartmentOpen(data.departmentId, { what: 'new programmes' });
  }
  await program.update(data);
  await audit.log({ userId: actor.id, action: 'program.update', entityType: 'Program', entityId: id, metadata: data, req });
  return getById(id);
};

/** Archived = closed to new applications and admissions; activating needs its department to be open. */
export const setStatus = async (id, status, actor, req) => {
  const program = await getById(id);
  if (program.status === status) throw new ConflictError(`${program.name} is already ${status}`);
  if (status === ORG_STATUS.ACTIVE && program.department?.status === ORG_STATUS.ARCHIVED) {
    throw new ConflictError(`Activate ${program.department.name} first: it is archived`, { code: 'DEPARTMENT_ARCHIVED' });
  }
  await program.update({ status });
  await audit.log({
    userId: actor.id, action: status === ORG_STATUS.ARCHIVED ? 'program.archive' : 'program.activate',
    entityType: 'Program', entityId: id, metadata: { code: program.code }, req,
  });
  return getById(id);
};

export const remove = async (id, actor, req) => {
  const program = await getById(id);
  await program.destroy();
  await audit.log({ userId: actor.id, action: 'program.delete', entityType: 'Program', entityId: id, metadata: { code: program.code }, req });
};

// ── Curriculum: which courses the program's students may register for ─────────

export const listCourses = async (programId) => {
  const program = await getById(programId);
  return program.getCourses({
    attributes: ['id', 'code', 'title', 'credits', 'level', 'status'],
    joinTableAttributes: ['type', 'recommendedLevel', 'semester', 'academicYearId'],
    order: [['code', 'ASC']],
  });
};

export const addCourse = async (programId, { courseId, type, recommendedLevel, semester, academicYearId }, actor) => {
  await getById(programId);
  if (!(await Course.findByPk(courseId))) throw new BadRequestError('Course does not exist');
  if (academicYearId && !(await AcademicYear.findByPk(academicYearId))) throw new BadRequestError('Academic year does not exist');
  if (await ProgramCourse.findOne({ where: { programId, courseId } })) {
    throw new ConflictError('Course is already on this program');
  }
  await ProgramCourse.create({ programId, courseId, type, recommendedLevel, semester, academicYearId });
  await audit.log({ userId: actor.id, action: 'program.course_add', entityType: 'Program', entityId: programId, metadata: { courseId, type } });
  return listCourses(programId);
};

export const removeCourse = async (programId, courseId, actor) => {
  const deleted = await ProgramCourse.destroy({ where: { programId, courseId } });
  if (!deleted) throw new NotFoundError('Program course');
  await audit.log({ userId: actor.id, action: 'program.course_remove', entityType: 'Program', entityId: programId, metadata: { courseId } });
};
