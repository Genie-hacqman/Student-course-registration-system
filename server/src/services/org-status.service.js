import { Department, Program } from '../models/index.js';
import { BadRequestError, ConflictError } from '../utils/errors.js';
import { ORG_STATUS } from '../utils/constants.js';

export const assertDepartmentOpen = async (departmentId, { transaction, what = 'new records' } = {}) => {
  const department = await Department.findByPk(departmentId, { transaction });
  if (!department) throw new BadRequestError('Department does not exist');
  if (department.status === ORG_STATUS.ARCHIVED) {
    throw new ConflictError(`${department.name} is archived and closed to ${what}`, { code: 'DEPARTMENT_ARCHIVED' });
  }
  return department;
};

export const assertProgramOpen = async (programId, { transaction, what = 'new students' } = {}) => {
  const program = await Program.findByPk(programId, {
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'status'] }],
    transaction,
  });
  if (!program) throw new BadRequestError('Program does not exist');
  if (program.status === ORG_STATUS.ARCHIVED) {
    throw new ConflictError(`${program.name} is archived and closed to ${what}`, { code: 'PROGRAM_ARCHIVED' });
  }
  if (program.department?.status === ORG_STATUS.ARCHIVED) {
    throw new ConflictError(`${program.department.name} is archived, so ${program.name} is closed to ${what}`, { code: 'DEPARTMENT_ARCHIVED' });
  }
  return program;
};

export const isOpen = (program) => program?.status !== ORG_STATUS.ARCHIVED && program?.department?.status !== ORG_STATUS.ARCHIVED;
