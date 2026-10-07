import { Op } from 'sequelize';
import { sequelize, AcademicYear, Semester } from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import * as audit from './audit.service.js';
import { snapshot, diffFields } from '../utils/audit-diff.js';

const yearInclude = { model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] };

// ── Academic years ────────────────────────────────────────────────────────────

export const listAcademicYears = () =>
  AcademicYear.findAll({ include: [{ model: Semester, as: 'semesters' }], order: [['startDate', 'DESC']] });

export const createAcademicYear = async (data, actor) => {
  return sequelize.transaction(async (transaction) => {
    const year = await AcademicYear.create(data, { transaction });
    await audit.log({ userId: actor.id, action: 'academic_year.create', entityType: 'AcademicYear', entityId: year.id, metadata: { name: year.name }, transaction });
    return year;
  });
};

export const updateAcademicYear = async (id, data, actor) => {
  const year = await AcademicYear.findByPk(id);
  if (!year) throw new NotFoundError('Academic year');
  const merged = { ...year.get(), ...data };
  if (merged.startDate >= merged.endDate) throw new BadRequestError('endDate must be after startDate');
  const fields = Object.keys(data);
  const before = snapshot(year, fields);
  await sequelize.transaction(async (transaction) => {
    await year.update(data, { transaction });
    await audit.log({
      userId: actor.id, action: 'academic_year.update', entityType: 'AcademicYear', entityId: id, transaction,
      metadata: { name: year.name, ...diffFields(before, snapshot(year, fields)) },
    });
  });
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

/**
 * Only one semester may be current: setting one clears the flag everywhere else in the same transaction.
 * Returns the ids it cleared, so the audit entry can say which semester stopped being current.
 */
const clearOtherCurrent = async (exceptId, transaction) => {
  const where = { isCurrent: true, id: { [Op.ne]: exceptId ?? 0 } };
  const cleared = await Semester.findAll({ where, attributes: ['id'], transaction });
  if (cleared.length) await Semester.update({ isCurrent: false }, { where, transaction });
  return cleared.map((s) => s.id);
};

export const create = async (data, actor) => {
  if (!(await AcademicYear.findByPk(data.academicYearId))) throw new BadRequestError('Academic year does not exist');
  assertValidWindow(data);

  const semester = await sequelize.transaction(async (transaction) => {
    const created = await Semester.create(data, { transaction });
    const stoppedBeingCurrent = data.isCurrent ? await clearOtherCurrent(created.id, transaction) : [];
    await audit.log({
      userId: actor.id, action: 'semester.create', entityType: 'Semester', entityId: created.id, transaction,
      metadata: { name: created.name, ...(stoppedBeingCurrent.length ? { previousCurrentSemesterIds: stoppedBeingCurrent } : {}) },
    });
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

  const fields = Object.keys(data);
  const before = snapshot(semester, fields);
  await sequelize.transaction(async (transaction) => {
    await semester.update(data, { transaction });
    const stoppedBeingCurrent = data.isCurrent ? await clearOtherCurrent(semester.id, transaction) : [];
    await audit.log({
      userId: actor.id, action: 'semester.update', entityType: 'Semester', entityId: id, transaction,
      metadata: {
        name: semester.name,
        ...diffFields(before, snapshot(semester, fields)),
        ...(stoppedBeingCurrent.length ? { previousCurrentSemesterIds: stoppedBeingCurrent } : {}),
      },
    });
  });
  return getById(id);
};
