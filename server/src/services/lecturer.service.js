import { Lecturer, User, Department, CourseSection, Course, Semester, Schedule, Registration, RegistrationItem, Student } from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors.js';
import { REGISTRATION_ITEM_STATUS, ADMIN_ROLES, ROLES } from '../utils/constants.js';
import * as audit from './audit.service.js';

const includes = [
  { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status'] },
  { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
];

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['staffNumber', 'createdAt']);
  const where = {};
  if (query.departmentId) where.departmentId = query.departmentId;
  const result = await Lecturer.findAndCountAll({ where, include: includes, limit, offset, order, distinct: true });
  return { result, page, limit };
};

export const getById = async (id) => {
  const lecturer = await Lecturer.findByPk(id, { include: includes });
  if (!lecturer) throw new NotFoundError('Lecturer');
  return lecturer;
};

export const getByUserId = async (userId) => {
  const lecturer = await Lecturer.findOne({ where: { userId }, include: includes });
  if (!lecturer) throw new ForbiddenError('Only lecturers can perform this action');
  return lecturer;
};

export const create = async (data, actor) => {
  if (!(await User.findByPk(data.userId))) throw new BadRequestError('User does not exist');
  if (!(await Department.findByPk(data.departmentId))) throw new BadRequestError('Department does not exist');
  const lecturer = await Lecturer.create(data);
  await audit.log({ userId: actor.id, action: 'lecturer.create', entityType: 'Lecturer', entityId: lecturer.id });
  return getById(lecturer.id);
};

export const update = async (id, data, actor) => {
  const lecturer = await getById(id);
  if (data.departmentId && !(await Department.findByPk(data.departmentId))) throw new BadRequestError('Department does not exist');
  await lecturer.update(data);
  await audit.log({ userId: actor.id, action: 'lecturer.update', entityType: 'Lecturer', entityId: id, metadata: data });
  return getById(id);
};

/** Sections taught by a lecturer, optionally limited to a semester. */
export const getSections = async (lecturerId, semesterId) =>
  CourseSection.findAll({
    where: { lecturerId, ...(semesterId ? { semesterId } : {}) },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits', 'level'] },
      { model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent'] },
      { model: Schedule, as: 'schedules' },
    ],
    order: [['semesterId', 'DESC'], ['id', 'ASC']],
  });

/** Registered students for a section. Lecturers may only see their own sections. */
export const getRoster = async (sectionId, actor) => {
  const section = await CourseSection.findByPk(sectionId, {
    include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title'] }],
  });
  if (!section) throw new NotFoundError('Section');

  if (actor.role === ROLES.LECTURER) {
    const lecturer = await getByUserId(actor.id);
    if (section.lecturerId !== lecturer.id) throw new ForbiddenError('You do not teach this section');
  } else if (![...ADMIN_ROLES, ROLES.ACADEMIC_ADVISOR].includes(actor.role)) {
    throw new ForbiddenError();
  }

  const items = await RegistrationItem.findAll({
    where: { courseSectionId: sectionId, status: REGISTRATION_ITEM_STATUS.REGISTERED },
    include: [{
      model: Registration,
      as: 'registration',
      attributes: ['id', 'status'],
      include: [{
        model: Student,
        as: 'student',
        attributes: ['id', 'studentNumber', 'level'],
        include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName', 'email'] }],
      }],
    }],
    order: [['createdAt', 'ASC']],
  });

  return {
    section: { id: section.id, sectionCode: section.sectionCode, course: section.course, capacity: section.capacity, seatsTaken: section.seatsTaken },
    students: items.map((i) => ({ ...i.registration.student.toJSON(), registrationStatus: i.registration.status, registeredAt: i.createdAt })),
  };
};
