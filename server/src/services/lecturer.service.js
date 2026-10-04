import { Op } from 'sequelize';
import {
  sequelize, Lecturer, User, Role, Department, CourseSection, Course, Semester, AcademicYear, Schedule, Registration, RegistrationItem, Student,
  SectionLecturerAssignment, LecturerDepartment,
} from '../models/index.js';
import { buildPagination } from '../utils/pagination.js';
import {
  NotFoundError, BadRequestError, ForbiddenError, ConflictError,
} from '../utils/errors.js';
import {
  REGISTRATION_ITEM_STATUS, ADMIN_ROLES, ROLES, USER_STATUS, SECTION_STATUS,
} from '../utils/constants.js';
import { UNUSABLE_PASSWORD_HASH } from '../utils/password.js';
import { issueInvite } from './password-reset.service.js';
import * as userService from './user.service.js';
import * as settingService from './setting.service.js';
import { assertDepartmentOpen } from './org-status.service.js';
import * as audit from './audit.service.js';

const includes = [
  { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'avatarThumb'] },
  { model: Department, as: 'department', attributes: ['id', 'name', 'code', 'status'] },
];
const DEPARTMENT_ATTRIBUTES = ['id', 'name', 'code', 'status'];

/** The additional departments of the given lecturers, as a Map lecturerId → [department]. One query for a page. */
const additionalDepartmentsFor = async (lecturerIds) => {
  const map = new Map(lecturerIds.map((id) => [id, []]));
  if (!lecturerIds.length) return map;
  const links = await LecturerDepartment.findAll({ where: { lecturerId: lecturerIds }, attributes: ['lecturerId', 'departmentId'] });
  const departments = await Department.findAll({ where: { id: [...new Set(links.map((l) => l.departmentId))] }, attributes: DEPARTMENT_ATTRIBUTES });
  const byId = new Map(departments.map((d) => [d.id, d.toJSON()]));
  for (const link of links) map.get(link.lecturerId)?.push(byId.get(link.departmentId));
  for (const list of map.values()) list.sort((a, b) => a.code.localeCompare(b.code));
  return map;
};

/** True when the lecturer belongs to the department, as their home department or an additional one. */
export const belongsToDepartment = async (lecturer, departmentId, transaction) => lecturer.departmentId === departmentId
  || Boolean(await LecturerDepartment.findOne({ where: { lecturerId: lecturer.id, departmentId }, attributes: ['id'], transaction }));

// Computed per lecturer: live (non-cancelled) offerings they teach, and whether they still have to set a password.
const summaryAttributes = {
  include: [
    [sequelize.literal(`(SELECT COUNT(*) FROM course_sections cs WHERE cs.lecturer_id = Lecturer.id AND cs.status <> ${sequelize.escape(SECTION_STATUS.CANCELLED)})`), 'currentSections'],
    [sequelize.literal(`(SELECT u.password_hash = ${sequelize.escape(UNUSABLE_PASSWORD_HASH)} FROM users u WHERE u.id = Lecturer.user_id)`), 'invitePending'],
  ],
};

/**
 * Lecturers, filtered and paginated on the server. `departmentId` matches their home department OR an additional
 * one; each row lists its additional departments, and `membership` says how they belong to the filtered department.
 */
export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['staffNumber', 'createdAt']);
  const where = {};
  if (query.departmentId) {
    where[Op.and] = [{
      [Op.or]: [
        { departmentId: query.departmentId },
        sequelize.literal(`EXISTS (SELECT 1 FROM lecturer_departments ld WHERE ld.lecturer_id = \`Lecturer\`.\`id\` AND ld.department_id = ${sequelize.escape(query.departmentId)})`),
      ],
    }];
  }
  if (query.status) where['$user.status$'] = query.status;
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [
      { staffNumber: { [Op.like]: like } },
      { '$user.first_name$': { [Op.like]: like } },
      { '$user.last_name$': { [Op.like]: like } },
      { '$user.email$': { [Op.like]: like } },
    ];
  }
  const { count, rows } = await Lecturer.findAndCountAll({
    where, include: includes, attributes: summaryAttributes, limit, offset, order, distinct: true, subQuery: false,
  });
  const extra = await additionalDepartmentsFor(rows.map((r) => r.id));
  const shaped = rows.map((r) => ({
    ...r.toJSON(),
    additionalDepartments: extra.get(r.id) ?? [],
    ...(query.departmentId ? { membership: r.departmentId === query.departmentId ? 'home' : 'additional' } : {}),
  }));
  return { result: { count, rows: shaped }, page, limit };
};

/** A department's lecturers: home and additional members, each marked with how they belong. */
export const listForDepartment = async (departmentId, query) => {
  if (!(await Department.findByPk(departmentId, { attributes: ['id'] }))) throw new NotFoundError('Department');
  return list({ ...query, departmentId });
};

/**
 * Replaces a lecturer's ADDITIONAL departments. The home department is set on the profile and can't be repeated
 * here; duplicates are collapsed; a department being newly added must be open (archived ones are closed to intake).
 */
export const setDepartments = async (id, departmentIds, actor, req) => {
  const lecturer = await Lecturer.findByPk(id, { include: [{ model: Department, as: 'department', attributes: ['id', 'name'] }] });
  if (!lecturer) throw new NotFoundError('Lecturer');
  const wanted = [...new Set(departmentIds)];
  if (wanted.includes(lecturer.departmentId)) {
    throw new BadRequestError(`${lecturer.department?.name ?? 'That department'} is already their home department`);
  }
  const { added, removed } = await sequelize.transaction(async (transaction) => {
    const current = (await LecturerDepartment.findAll({ where: { lecturerId: id }, attributes: ['departmentId'], transaction, lock: transaction.LOCK.UPDATE }))
      .map((l) => l.departmentId);
    const toAdd = wanted.filter((d) => !current.includes(d));
    const toRemove = current.filter((d) => !wanted.includes(d));
    for (const departmentId of toAdd) await assertDepartmentOpen(departmentId, { transaction, what: 'new lecturers' });
    if (toRemove.length) await LecturerDepartment.destroy({ where: { lecturerId: id, departmentId: toRemove }, transaction });
    for (const departmentId of toAdd) await LecturerDepartment.create({ lecturerId: id, departmentId }, { transaction });
    await audit.log({
      userId: actor.id, action: 'lecturer.departments_update', entityType: 'Lecturer', entityId: id,
      metadata: { added: toAdd, removed: toRemove }, req, transaction,
    });
    return { added: toAdd, removed: toRemove };
  });
  return { ...(await getById(id)).toJSON(), changes: { added, removed } };
};

/** Profile plus every course offering they were ever assigned (current first). */
export const getById = async (id) => {
  const lecturer = await Lecturer.findByPk(id, {
    include: [
      ...includes.map((i) => (i.as === 'user' ? { ...i, attributes: [...i.attributes, 'avatar'] } : i)),
      { model: Department, as: 'additionalDepartments', attributes: DEPARTMENT_ATTRIBUTES, through: { attributes: [] } },
      {
        model: SectionLecturerAssignment,
        as: 'assignments',
        required: false,
        include: [{
          model: CourseSection,
          as: 'section',
          attributes: ['id', 'sectionCode', 'status', 'seatsTaken', 'capacity'],
          include: [
            { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'departmentId'] },
            // Class times, so the profile can show the lecturer's teaching timetable.
            { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
            {
              model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent'],
              include: [{ model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] }],
            },
          ],
        }],
      },
    ],
    attributes: summaryAttributes,
    order: [[{ model: SectionLecturerAssignment, as: 'assignments' }, 'assignedAt', 'DESC']],
  });
  if (!lecturer) throw new NotFoundError('Lecturer');
  // What they teach this term, from the offerings themselves (course_sections.lecturer_id is the current lecturer;
  // assignment history may be missing for offerings created before it existed or set up by import).
  const teaching = await CourseSection.findAll({
    where: { lecturerId: lecturer.id, status: { [Op.ne]: SECTION_STATUS.CANCELLED } },
    attributes: ['id', 'sectionCode', 'status', 'seatsTaken', 'capacity'],
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'departmentId'] },
      { model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent'], where: { isCurrent: true } },
      { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
    ],
    order: [[{ model: Course, as: 'course' }, 'code', 'ASC']],
  });
  lecturer.setDataValue('currentTeaching', teaching);
  return lecturer;
};

const assertStaffNumberFree = async (staffNumber, exceptId, transaction) => {
  const taken = await Lecturer.findOne({ where: { staffNumber }, attributes: ['id'], transaction });
  if (taken && taken.id !== exceptId) throw new ConflictError(`Staff ID ${staffNumber} is already used by another lecturer`);
};

const assertPersonalEmailFree = async (personalEmail, exceptId, transaction) => {
  if (!personalEmail) return;
  const email = personalEmail.toLowerCase();
  const taken = await Lecturer.findOne({ where: { personalEmail: email }, attributes: ['id'], transaction });
  if (taken && taken.id !== exceptId) throw new ConflictError(`Personal email ${email} is already used by another lecturer`);
};

const slug = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** The school email: as entered, or first.last@<institution.staffEmailDomain> (first.last2@… if taken). */
const resolveSchoolEmail = async ({ schoolEmail, firstName, lastName }, transaction) => {
  if (schoolEmail) {
    const email = schoolEmail.toLowerCase();
    if (await User.findOne({ where: { email }, attributes: ['id'], transaction })) {
      throw new ConflictError(`School email ${email} is already used by another account`);
    }
    return email;
  }
  const domain = await settingService.get('institution.staffEmailDomain', { transaction });
  if (!domain) {
    throw new BadRequestError('Enter the lecturer\'s school email, or set the staff email domain (institution.staffEmailDomain) to generate one');
  }
  const base = `${slug(firstName)}.${slug(lastName)}`.replace(/^\.|\.$/g, '') || 'staff';
  for (let n = 1; ; n += 1) {
    const email = `${base}${n === 1 ? '' : n}@${domain}`;
    if (!(await User.findOne({ where: { email }, attributes: ['id'], transaction }))) return email;
  }
};

/**
 * Creates a lecturer's account and profile in one transaction, then emails a single-use
 * set-your-password link (to the personal email when given). No password is ever chosen by staff
 * or sent by email; the lecturer signs in with the school email once they've set theirs.
 */
const createAccount = async (data, actor) => {
  const { user, lecturer } = await sequelize.transaction(async (transaction) => {
    await assertStaffNumberFree(data.staffNumber, null, transaction);
    await assertPersonalEmailFree(data.personalEmail, null, transaction);
    await assertDepartmentOpen(data.departmentId, { transaction, what: 'new lecturers' });
    const email = await resolveSchoolEmail(data, transaction);
    const role = await Role.findOne({ where: { name: ROLES.LECTURER }, transaction });

    const createdUser = await User.create({
      roleId: role.id,
      firstName: data.firstName,
      lastName: data.lastName,
      email,
      passwordHash: UNUSABLE_PASSWORD_HASH,
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(), // the school issues the mailbox
    }, { transaction });
    const createdLecturer = await Lecturer.create({
      userId: createdUser.id,
      departmentId: data.departmentId,
      staffNumber: data.staffNumber,
      title: data.title,
      phone: data.phone,
      specialization: data.specialization,
      personalEmail: data.personalEmail,
    }, { transaction });
    await audit.log({
      userId: actor.id, action: 'lecturer.create', entityType: 'Lecturer', entityId: createdLecturer.id,
      metadata: { staffNumber: data.staffNumber, email, departmentId: data.departmentId }, transaction,
    });
    return { user: createdUser, lecturer: createdLecturer };
  });
  await issueInvite(user, { actor, to: lecturer.personalEmail ?? user.email });
  return getById(lecturer.id);
};

/** `{ userId, … }` attaches a profile to an existing account (older flow); otherwise creates the account too. */
export const create = async (data, actor) => {
  if (!data.userId) return createAccount(data, actor);
  if (!(await User.findByPk(data.userId))) throw new BadRequestError('User does not exist');
  await assertDepartmentOpen(data.departmentId, { what: 'new lecturers' });
  await assertStaffNumberFree(data.staffNumber);
  const lecturer = await Lecturer.create(data);
  await audit.log({ userId: actor.id, action: 'lecturer.create', entityType: 'Lecturer', entityId: lecturer.id });
  return getById(lecturer.id);
};

export const update = async (id, data, actor) => {
  const lecturer = await Lecturer.findByPk(id);
  if (!lecturer) throw new NotFoundError('Lecturer');
  const { firstName, lastName, ...fields } = data;
  await sequelize.transaction(async (transaction) => {
    if (fields.departmentId && fields.departmentId !== lecturer.departmentId) {
      await assertDepartmentOpen(fields.departmentId, { transaction, what: 'new lecturers' });
    }
    if (fields.staffNumber) await assertStaffNumberFree(fields.staffNumber, lecturer.id, transaction);
    await assertPersonalEmailFree(fields.personalEmail, lecturer.id, transaction);
    await lecturer.update(fields, { transaction });
    const names = Object.fromEntries(Object.entries({ firstName, lastName }).filter(([, v]) => v !== undefined));
    if (Object.keys(names).length) await User.update(names, { where: { id: lecturer.userId }, transaction });
    await audit.log({ userId: actor.id, action: 'lecturer.update', entityType: 'Lecturer', entityId: id, metadata: data, transaction });
  });
  return getById(id);
};

/** Activate or deactivate the lecturer's account (deactivating ends their sessions). Assignments are kept. */
export const setActive = async (id, active, actor) => {
  const lecturer = await Lecturer.findByPk(id);
  if (!lecturer) throw new NotFoundError('Lecturer');
  await userService.update(lecturer.userId, { status: active ? USER_STATUS.ACTIVE : USER_STATUS.SUSPENDED }, actor);
  await audit.log({ userId: actor.id, action: active ? 'lecturer.activate' : 'lecturer.deactivate', entityType: 'Lecturer', entityId: id });
  return getById(id);
};

/** Re-sends the set-your-password link (to the personal email when known). */
export const resendInvite = async (id, actor) => {
  const lecturer = await Lecturer.findByPk(id);
  if (!lecturer) throw new NotFoundError('Lecturer');
  const user = await User.scope('withSecrets').findByPk(lecturer.userId);
  if (user.passwordHash !== UNUSABLE_PASSWORD_HASH) throw new ConflictError('This lecturer has already activated their account');
  if (user.status !== USER_STATUS.ACTIVE) throw new BadRequestError('Activate the lecturer before sending an invite');
  await issueInvite(user, { actor, to: lecturer.personalEmail ?? user.email });
};

export const getByUserId = async (userId) => {
  const lecturer = await Lecturer.findOne({ where: { userId }, include: includes });
  if (!lecturer) throw new ForbiddenError('Only lecturers can perform this action');
  return lecturer;
};

/** Sections taught by a lecturer, optionally limited to a semester. */
export const getSections = async (lecturerId, semesterId) =>
  CourseSection.findAll({
    where: { lecturerId, ...(semesterId ? { semesterId } : {}) },
    include: [
      { model: Course, as: 'course', attributes: ['id', 'code', 'title', 'credits', 'level'] },
      {
        model: Semester, as: 'semester', attributes: ['id', 'name', 'isCurrent'],
        include: [{ model: AcademicYear, as: 'academicYear', attributes: ['id', 'name'] }],
      },
      { model: Schedule, as: 'schedules', attributes: ['id', 'day', 'startTime', 'endTime', 'room'] },
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
  } else if (!ADMIN_ROLES.includes(actor.role)) {
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
