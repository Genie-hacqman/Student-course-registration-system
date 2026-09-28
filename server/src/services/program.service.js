import { Program, Department, Course, ProgramCourse } from '../models/index.js';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors.js';
import * as audit from './audit.service.js';

const include = [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }];

export const list = ({ departmentId } = {}) =>
  Program.findAll({ where: departmentId ? { departmentId } : {}, include, order: [['code', 'ASC']] });

export const getById = async (id) => {
  const program = await Program.findByPk(id, { include });
  if (!program) throw new NotFoundError('Program');
  return program;
};

export const create = async (data, actor) => {
  if (!(await Department.findByPk(data.departmentId))) throw new BadRequestError('Department does not exist');
  const program = await Program.create(data);
  await audit.log({ userId: actor.id, action: 'program.create', entityType: 'Program', entityId: program.id });
  return getById(program.id);
};

export const update = async (id, data, actor) => {
  const program = await getById(id);
  if (data.departmentId && !(await Department.findByPk(data.departmentId))) throw new BadRequestError('Department does not exist');
  await program.update(data);
  await audit.log({ userId: actor.id, action: 'program.update', entityType: 'Program', entityId: id, metadata: data });
  return getById(id);
};

export const remove = async (id, actor) => {
  const program = await getById(id);
  await program.destroy();
  await audit.log({ userId: actor.id, action: 'program.delete', entityType: 'Program', entityId: id });
};

// ── Curriculum: which courses the program's students may register for ─────────

export const listCourses = async (programId) => {
  const program = await getById(programId);
  return program.getCourses({
    attributes: ['id', 'code', 'title', 'credits', 'level', 'status'],
    joinTableAttributes: ['type', 'recommendedLevel'],
    order: [['code', 'ASC']],
  });
};

export const addCourse = async (programId, { courseId, type, recommendedLevel }, actor) => {
  await getById(programId);
  if (!(await Course.findByPk(courseId))) throw new BadRequestError('Course does not exist');
  if (await ProgramCourse.findOne({ where: { programId, courseId } })) {
    throw new ConflictError('Course is already on this program');
  }
  await ProgramCourse.create({ programId, courseId, type, recommendedLevel });
  await audit.log({ userId: actor.id, action: 'program.course_add', entityType: 'Program', entityId: programId, metadata: { courseId, type } });
  return listCourses(programId);
};

export const removeCourse = async (programId, courseId, actor) => {
  const deleted = await ProgramCourse.destroy({ where: { programId, courseId } });
  if (!deleted) throw new NotFoundError('Program course');
  await audit.log({ userId: actor.id, action: 'program.course_remove', entityType: 'Program', entityId: programId, metadata: { courseId } });
};
