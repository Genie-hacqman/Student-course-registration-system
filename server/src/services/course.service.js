import { Op } from 'sequelize';
import {
  sequelize, Course, Department, CourseSection, Semester, Schedule, Lecturer, User,
} from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';
import { COURSE_STATUS, SECTION_STATUS, ADMIN_ROLES } from '../utils/constants.js';
import { COURSE_SORT_FIELDS } from '../validators/course.validator.js';
import { assertDepartmentOpen } from './org-status.service.js';
import * as audit from './audit.service.js';

const isAdmin = (actor) => ADMIN_ROLES.includes(actor?.role);

const departmentInclude = { model: Department, as: 'department', attributes: ['id', 'name', 'code'] };

/**
 * Search/filter/sort/paginate courses.
 * Non-admin users only ever see active courses and non-cancelled sections, whatever they ask for.
 */
export const list = async (query, actor) => {
  const { page, limit, offset, order } = buildPagination(query, COURSE_SORT_FIELDS, ['code', 'ASC']);
  const where = {};

  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [{ code: { [Op.like]: like } }, { title: { [Op.like]: like } }];
  }
  if (query.departmentId) where.departmentId = query.departmentId;
  if (query.level) where.level = query.level;

  if (isAdmin(actor)) {
    if (query.status) where.status = query.status;
  } else {
    where.status = COURSE_STATUS.ACTIVE;
  }

  const idFilters = [];
  if (query.semesterId) {
    const statusFilter = isAdmin(actor) ? '' : ` AND status <> ${sequelize.escape(SECTION_STATUS.CANCELLED)}`;
    idFilters.push({ id: { [Op.in]: sequelize.literal(
      `(SELECT course_id FROM course_sections WHERE semester_id = ${sequelize.escape(query.semesterId)}${statusFilter})`,
    ) } });
  }
  // Courses on a programme's curriculum.
  if (query.programId) {
    idFilters.push({ id: { [Op.in]: sequelize.literal(
      `(SELECT course_id FROM program_courses WHERE program_id = ${sequelize.escape(query.programId)})`,
    ) } });
  }
  if (idFilters.length) where[Op.and] = idFilters;

  const result = await Course.findAndCountAll({
    where,
    include: [departmentInclude],
    limit,
    offset,
    order,
    distinct: true,
  });
  return { result, page, limit };
};

export const getById = async (id, actor) => {
  const course = await Course.findByPk(id, {
    include: [
      departmentInclude,
      {
        model: Course,
        as: 'prerequisites',
        attributes: ['id', 'code', 'title', 'credits', 'level'],
        through: { attributes: ['type', 'minGrade', 'groupNo'] },
      },
      {
        model: CourseSection,
        as: 'sections',
        required: false,
        where: isAdmin(actor) ? undefined : { status: { [Op.ne]: SECTION_STATUS.CANCELLED } },
        include: [
          { model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent'] },
          { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
          {
            model: Lecturer,
            as: 'lecturer',
            attributes: ['id', 'title'],
            include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }],
          },
        ],
      },
    ],
  });

  if (!course || (!isAdmin(actor) && course.status !== COURSE_STATUS.ACTIVE)) throw new NotFoundError('Course');
  return course;
};

export const create = async (data, actor) => {
  await assertDepartmentOpen(data.departmentId, { what: 'new courses' });
  const course = await Course.create(data);
  await audit.log({ userId: actor.id, action: 'course.create', entityType: 'Course', entityId: course.id, metadata: { code: course.code } });
  return getById(course.id, actor);
};

export const update = async (id, data, actor) => {
  const course = await Course.findByPk(id);
  if (!course) throw new NotFoundError('Course');
  if (data.departmentId && data.departmentId !== course.departmentId) {
    await assertDepartmentOpen(data.departmentId, { what: 'new courses' });
  }
  await course.update(data);
  await audit.log({ userId: actor.id, action: 'course.update', entityType: 'Course', entityId: course.id, metadata: data });
  return getById(course.id, actor);
};

/** Soft delete: registrations and results keep referencing the course, so it is deactivated instead. */
export const remove = async (id, actor) => {
  const course = await Course.findByPk(id);
  if (!course) throw new NotFoundError('Course');
  await course.update({ status: COURSE_STATUS.INACTIVE });
  await audit.log({ userId: actor.id, action: 'course.deactivate', entityType: 'Course', entityId: course.id });
};
