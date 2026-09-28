import { Op } from 'sequelize';
import { sequelize, AcademicYear, Semester } from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import * as audit from './audit.service.js';

const yearInclude = { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] };

// ── Academic years ────────────────────────────────────────────────────────────

export const listAcademicYears = () =>
  AcademicYear.findAll({ include: [{ model: Semester, as: 'semesters' }], order: [['startDate', 'DESC']] });

export const createAcademicYear = async (data, actor) => {
  const year = await AcademicYear.create(data);
  await audit.log({ userId: actor.id, action: 'academic_year.create', entityType: 'AcademicYear', entityId: year.id });
  return year;
};

export const updateAcademicYear = async (id, data, actor) => {
  const year = await AcademicYear.findByPk(id);
  if (!year) throw new NotFoundError('Academic year');
  const merged = { ...year.get(), ...data };
  if (merged.startDate >= merged.endDate) throw new BadRequestError('endDate must be after startDate');
  await year.update(data);
  await audit.log({ userId: actor.id, action: 'academic_year.update', entityType: 'AcademicYear', entityId: id, metadata: data });
  return year;
};

// ── Semesters ─────────────────────────────────────────────────────────────────

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['startDate', 'name', 'createdAt'], ['startDate', 'DESC']);
  const where = {};
  if (query.academicYearId) where.academicYearId = query.academicYearId;
  if (query.status) where.status = query.status;
  const result = await Semester.findAndCountAll({ where, include: [yearInclude], limit, offset, order });
  return { result, page, limit };
};

export const getById = async (id) => {
  const semester = await Semester.findByPk(id, { include: [yearInclude] });
  if (!semester) throw new NotFoundError('Semester');
  return semester;
};

/** The single semester flagged as current, or null. Registration always runs against this one. */
export const findCurrent = (options = {}) => Semester.findOne({ where: { isCurrent: true }, include: [yearInclude], ...options });

export const getCurrent = async () => {
  const semester = await findCurrent();
  if (!semester) throw new NotFoundError('Current semester');
  const now = new Date();
  return {
    ...semester.toJSON(),
    registrationOpen: semester.isRegistrationOpen(now),
    addDropOpen: semester.isAddDropOpen(now),
  };
};

const assertValidWindow = (s) => {
  if (s.startDate >= s.endDate) throw new BadRequestError('endDate must be after startDate');
  if (new Date(s.registrationStart) >= new Date(s.registrationEnd)) {
    throw new BadRequestError('registrationEnd must be after registrationStart');
  }
  if (s.addDropEnd && new Date(s.addDropEnd) < new Date(s.registrationStart)) {
    throw new BadRequestError('addDropEnd must be after registrationStart');
  }
  if (s.maxCredits != null && s.minCredits > s.maxCredits) {
    throw new BadRequestError('minCredits cannot exceed maxCredits');
  }
};

/** Only one semester may be current: setting one clears the flag everywhere else in the same transaction. */
const clearOtherCurrent = (exceptId, transaction) =>
  Semester.update({ isCurrent: false }, { where: { isCurrent: true, id: { [Op.ne]: exceptId ?? 0 } }, transaction });

export const create = async (data, actor) => {
  if (!(await AcademicYear.findByPk(data.academicYearId))) throw new BadRequestError('Academic year does not exist');
  assertValidWindow(data);

  const semester = await sequelize.transaction(async (transaction) => {
    const created = await Semester.create(data, { transaction });
    if (data.isCurrent) await clearOtherCurrent(created.id, transaction);
    await audit.log({ userId: actor.id, action: 'semester.create', entityType: 'Semester', entityId: created.id, transaction });
    return created;
  });
  return getById(semester.id);
};

export const update = async (id, data, actor) => {
  const semester = await getById(id);
  if (data.academicYearId && !(await AcademicYear.findByPk(data.academicYearId))) {
    throw new BadRequestError('Academic year does not exist');
  }
  assertValidWindow({ ...semester.get(), ...data });

  await sequelize.transaction(async (transaction) => {
    await semester.update(data, { transaction });
    if (data.isCurrent) await clearOtherCurrent(semester.id, transaction);
    await audit.log({ userId: actor.id, action: 'semester.update', entityType: 'Semester', entityId: id, metadata: data, transaction });
  });
  return getById(id);
};
