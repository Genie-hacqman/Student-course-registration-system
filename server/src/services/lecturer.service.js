import { randomBytes } from 'node:crypto';
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
import { snapshot, diffFields } from '../utils/audit-diff.js';

const includes = [
  { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'status', 'avatarThumb'] },
  { model: Department, as: 'department', attributes: ['id', 'name', 'code', 'status'] },
];
const DEPARTMENT_ATTRIBUTES = ['id', 'name', 'code', 'status'];

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

export const belongsToDepartment = async (lecturer, departmentId, transaction) => lecturer.departmentId === departmentId
  || Boolean(await LecturerDepartment.findOne({ where: { lecturerId: lecturer.id, departmentId }, attributes: ['id'], transaction }));

const summaryAttributes = {
  include: [
    [sequelize.literal(`(SELECT COUNT(*) FROM course_sections cs WHERE cs.lecturer_id = Lecturer.id AND cs.status <> ${sequelize.escape(SECTION_STATUS.CANCELLED)})`), 'currentSections'],
    [sequelize.literal(`(SELECT u.password_hash = ${sequelize.escape(UNUSABLE_PASSWORD_HASH)} FROM users u WHERE u.id = Lecturer.user_id)`), 'invitePending'],
  ],
};

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

export const listForDepartment = async (departmentId, query) => {
  if (!(await Department.findByPk(departmentId, { attributes: ['id'] }))) throw new NotFoundError('Department');
  return list({ ...query, departmentId });
};

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

export const buildStaffNumber = (id) => `STF${String(id).padStart(6, '0')}`;

// Without a staff number, derive one from the row id; skip past any hand-entered number that already took it.
const createLecturerRecord = async ({ staffNumber, ...data }, transaction) => {
  const lecturer = await Lecturer.create(
    { ...data, staffNumber: staffNumber ?? `PENDING-${randomBytes(8).toString('hex')}` },
    { transaction },
  );
  if (staffNumber) return lecturer;
  for (let n = lecturer.id; ; n += 1) {
    const candidate = buildStaffNumber(n);
    if (!(await Lecturer.findOne({ where: { staffNumber: candidate }, attributes: ['id'], transaction }))) {
      await lecturer.update({ staffNumber: candidate }, { transaction });
      return lecturer;
    }
  }
};

const assertPersonalEmailFree = async (personalEmail, exceptId, transaction) => {
  if (!personalEmail) return;
  const email = personalEmail.toLowerCase();
  const taken = await Lecturer.findOne({ where: { personalEmail: email }, attributes: ['id'], transaction });
  if (taken && taken.id !== exceptId) throw new ConflictError(`Personal email ${email} is already used by another lecturer`);
};

const slug = (s) => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

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

const createAccount = async (data, actor) => {
  const { user, lecturer } = await sequelize.transaction(async (transaction) => {
    if (data.staffNumber) await assertStaffNumberFree(data.staffNumber, null, transaction);
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
      emailVerifiedAt: new Date(),
    }, { transaction });
    const createdLecturer = await createLecturerRecord({
      userId: createdUser.id,
      departmentId: data.departmentId,
      staffNumber: data.staffNumber,
      title: data.title,
      phone: data.phone,
      specialization: data.specialization,
      personalEmail: data.personalEmail,
    }, transaction);
    await audit.log({
      userId: actor.id, action: 'lecturer.create', entityType: 'Lecturer', entityId: createdLecturer.id,
      metadata: { staffNumber: createdLecturer.staffNumber, email, departmentId: data.departmentId }, transaction,
    });
    return { user: createdUser, lecturer: createdLecturer };
  });
  await issueInvite(user, { actor, to: lecturer.personalEmail ?? user.email });
  return getById(lecturer.id);
};

export const create = async (data, actor) => {
  if (!data.userId) return createAccount(data, actor);
  if (!(await User.findByPk(data.userId))) throw new BadRequestError('User does not exist');
  await assertDepartmentOpen(data.departmentId, { what: 'new lecturers' });
  if (data.staffNumber) await assertStaffNumberFree(data.staffNumber);
  const lecturer = await sequelize.transaction(async (transaction) => {
    const created = await createLecturerRecord(data, transaction);
    await audit.log({
      userId: actor.id, action: 'lecturer.create', entityType: 'Lecturer', entityId: created.id, transaction,
      metadata: { staffNumber: created.staffNumber, departmentId: created.departmentId, userId: created.userId },
    });
    return created;
  });
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
    const fieldKeys = Object.keys(fields);
    const names = Object.fromEntries(Object.entries({ firstName, lastName }).filter(([, v]) => v !== undefined));
    const nameKeys = Object.keys(names);
    const before = snapshot(lecturer, fieldKeys);
    if (nameKeys.length) {
      Object.assign(before, snapshot(await User.findByPk(lecturer.userId, { attributes: nameKeys, transaction }), nameKeys));
    }
    await lecturer.update(fields, { transaction });
    if (nameKeys.length) await User.update(names, { where: { id: lecturer.userId }, transaction });
    await audit.log({
      userId: actor.id, action: 'lecturer.update', entityType: 'Lecturer', entityId: id, transaction,
      metadata: { staffNumber: lecturer.staffNumber, ...diffFields(before, { ...snapshot(lecturer, fieldKeys), ...names }, { omitValues: ['phone', 'personalEmail'] }) },
    });
  });
  return getById(id);
};

export const setActive = async (id, active, actor) => {
  const lecturer = await Lecturer.findByPk(id);
  if (!lecturer) throw new NotFoundError('Lecturer');
  const status = active ? USER_STATUS.ACTIVE : USER_STATUS.SUSPENDED;
  await sequelize.transaction(async (transaction) => {
    const account = await User.findByPk(lecturer.userId, { attributes: ['id', 'status'], transaction });
    await userService.update(lecturer.userId, { status }, actor, undefined, { transaction, audit: false });
    await audit.log({
      userId: actor.id, action: active ? 'lecturer.activate' : 'lecturer.deactivate', entityType: 'Lecturer', entityId: id, transaction,
      metadata: { userId: lecturer.userId, statusBefore: account?.status ?? null, statusAfter: status },
    });
  });
  return getById(id);
};

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
