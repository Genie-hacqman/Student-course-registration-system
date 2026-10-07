import { Op, QueryTypes } from 'sequelize';
import { sequelize, Department, Program } from '../models/index.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { buildPagination } from '../utils/pagination.js';
import { ORG_STATUS } from '../utils/constants.js';
import * as audit from './audit.service.js';
import { snapshot, diffFields } from '../utils/audit-diff.js';

/** All departments (pickers, filters). `status` narrows it, e.g. `active` for forms that create new records. */
export const list = ({ status } = {}) => Department.findAll({ where: status ? { status } : {}, order: [['code', 'ASC']] });

export const getById = async (id) => {
  const department = await Department.findByPk(id, { include: [{ model: Program, as: 'programs' }] });
  if (!department) throw new NotFoundError('Department');
  return department;
};

// Counts computed from the actual rows. Students belong to a department through their programme; lecturers through
// their home department or an additional one (lecturer_departments).
const D = '`Department`.`id`';
const countAttributes = [
  [sequelize.literal(`(SELECT COUNT(*) FROM programs p WHERE p.department_id = ${D})`), 'programCount'],
  [sequelize.literal(`(SELECT COUNT(*) FROM programs p WHERE p.department_id = ${D} AND p.status = 'active')`), 'activeProgramCount'],
  [sequelize.literal(`(SELECT COUNT(*) FROM students s JOIN programs p ON p.id = s.program_id WHERE p.department_id = ${D})`), 'studentCount'],
  [sequelize.literal(`(SELECT COUNT(*) FROM students s JOIN programs p ON p.id = s.program_id WHERE p.department_id = ${D} AND s.status = 'active')`), 'activeStudentCount'],
  [sequelize.literal(`(SELECT COUNT(*) FROM lecturers l WHERE l.department_id = ${D}
      OR EXISTS (SELECT 1 FROM lecturer_departments ld WHERE ld.lecturer_id = l.id AND ld.department_id = ${D}))`), 'lecturerCount'],
  [sequelize.literal(`(SELECT COUNT(*) FROM courses c WHERE c.department_id = ${D})`), 'courseCount'],
];
const toCounts = (row) => {
  const d = row.toJSON();
  return {
    id: d.id, code: d.code, name: d.name, status: d.status,
    counts: {
      programs: Number(d.programCount), activePrograms: Number(d.activeProgramCount),
      students: Number(d.studentCount), activeStudents: Number(d.activeStudentCount),
      lecturers: Number(d.lecturerCount), courses: Number(d.courseCount),
    },
  };
};

/** Departments with their counts; searchable by name or code, filterable by status, paginated. */
export const summary = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['code', 'name', 'createdAt'], ['code', 'ASC']);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.search) where[Op.or] = [{ name: { [Op.like]: `%${query.search}%` } }, { code: { [Op.like]: `%${query.search}%` } }];
  const { count, rows } = await Department.findAndCountAll({
    where, attributes: { include: countAttributes }, limit, offset, order,
  });
  return { result: { count, rows: rows.map(toCounts) }, page, limit };
};

/** One department: its counts, and its programmes with how many students are at each level (for drill-down). */
export const overview = async (id) => {
  const department = await Department.findByPk(id, { attributes: { include: countAttributes } });
  if (!department) throw new NotFoundError('Department');
  const rows = await sequelize.query(
    `SELECT p.id, p.code, p.name, p.status, p.qualification_code AS qualificationCode, p.duration_years AS durationYears,
            s.level, COUNT(s.id) AS students
       FROM programs p LEFT JOIN students s ON s.program_id = p.id
      WHERE p.department_id = :id
      GROUP BY p.id, s.level
      ORDER BY p.code, s.level`,
    { replacements: { id }, type: QueryTypes.SELECT },
  );
  const programs = new Map();
  for (const r of rows) {
    if (!programs.has(r.id)) {
      programs.set(r.id, {
        id: r.id, code: r.code, name: r.name, status: r.status, qualificationCode: r.qualificationCode,
        durationYears: r.durationYears, students: 0, levels: [],
      });
    }
    const program = programs.get(r.id);
    const n = Number(r.students);
    if (r.level !== null && n > 0) {
      program.levels.push({ level: r.level, students: n });
      program.students += n;
    }
  }
  return { ...toCounts(department), programs: [...programs.values()] };
};

export const create = async (data, actor, req) => {
  return sequelize.transaction(async (transaction) => {
    const department = await Department.create(data, { transaction });
    await audit.log({ userId: actor.id, action: 'department.create', entityType: 'Department', entityId: department.id, metadata: data, req, transaction });
    return department;
  });
};

export const update = async (id, data, actor, req) => {
  const department = await getById(id);
  const fields = Object.keys(data);
  const before = snapshot(department, fields);
  await sequelize.transaction(async (transaction) => {
    await department.update(data, { transaction });
    await audit.log({
      userId: actor.id, action: 'department.update', entityType: 'Department', entityId: id, transaction,
      metadata: { code: department.code, ...diffFields(before, snapshot(department, fields)) }, req,
    });
  });
  return department;
};

/**
 * Archived = closed to new intake (no new programmes, courses, lecturers, applications or admissions under it).
 * Its programmes, students and lecturers stay as they are and remain visible; activating reverses it.
 */
export const setStatus = async (id, status, actor, req) => {
  const department = await getById(id);
  if (department.status === status) throw new ConflictError(`${department.name} is already ${status}`);
  const previousStatus = department.status;
  await sequelize.transaction(async (transaction) => {
    await department.update({ status }, { transaction });
    await audit.log({
      userId: actor.id, action: status === ORG_STATUS.ARCHIVED ? 'department.archive' : 'department.activate', transaction,
      entityType: 'Department', entityId: id, metadata: { code: department.code, changes: { status: { from: previousStatus, to: status } } }, req,
    });
  });
  return department;
};

/** Fails with 409 (FK constraint) while programs, courses or lecturers still reference it. */
export const remove = async (id, actor, req) => {
  const department = await getById(id);
  await sequelize.transaction(async (transaction) => {
    await department.destroy({ transaction });
    await audit.log({ userId: actor.id, action: 'department.delete', entityType: 'Department', entityId: id, metadata: { code: department.code }, req, transaction });
  });
};
