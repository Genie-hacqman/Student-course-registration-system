import { Department, Program } from '../models/index.js';
import { NotFoundError } from '../utils/errors.js';
import * as audit from './audit.service.js';

export const list = () => Department.findAll({ order: [['code', 'ASC']] });

export const getById = async (id) => {
  const department = await Department.findByPk(id, { include: [{ model: Program, as: 'programs' }] });
  if (!department) throw new NotFoundError('Department');
  return department;
};

export const create = async (data, actor) => {
  const department = await Department.create(data);
  await audit.log({ userId: actor.id, action: 'department.create', entityType: 'Department', entityId: department.id });
  return department;
};

export const update = async (id, data, actor) => {
  const department = await getById(id);
  await department.update(data);
  await audit.log({ userId: actor.id, action: 'department.update', entityType: 'Department', entityId: id, metadata: data });
  return department;
};

/** Fails with 409 (FK constraint) while programs, courses or lecturers still reference it. */
export const remove = async (id, actor) => {
  const department = await getById(id);
  await department.destroy();
  await audit.log({ userId: actor.id, action: 'department.delete', entityType: 'Department', entityId: id });
};
