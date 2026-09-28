import { Op } from 'sequelize';
import {
  sequelize, Announcement, User, Role, Student, CourseSection, Course, Program, Registration, RegistrationItem,
} from '../models/index.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../utils/errors.js';
import {
  ANNOUNCEMENT_AUDIENCE as A, REGISTRATION_ITEM_STATUS, REGISTRATION_STATUS, ROLES, STAFF_ROLES, USER_STATUS, PERMISSIONS,
} from '../utils/constants.js';
import { buildPagination } from '../utils/pagination.js';
import { hasPermission } from './permission.service.js';
import * as lecturerService from './lecturer.service.js';
import * as notificationService from './notification.service.js';
import * as audit from './audit.service.js';

const includes = [
  {
    model: User, as: 'author', attributes: ['id', 'firstName', 'lastName'],
    include: [{ model: Role, as: 'role', attributes: ['name'] }],
  },
  {
    model: CourseSection, as: 'section', attributes: ['id', 'sectionCode'],
    include: [{ model: Course, as: 'course', attributes: ['id', 'code', 'title'] }],
  },
  { model: Program, as: 'program', attributes: ['id', 'code', 'name'] },
];

const liveRegistration = { status: { [Op.ne]: REGISTRATION_STATUS.CANCELLED } };

const activeUsersWithRoles = async (roles, transaction) => (await User.findAll({
  where: { status: USER_STATUS.ACTIVE },
  attributes: ['id'],
  include: [{ model: Role, as: 'role', attributes: [], ...(roles ? { where: { name: roles } } : {}) }],
  transaction,
})).map((u) => u.id);

/** User ids an announcement reaches. */
const recipients = async ({ audience, courseSectionId, programId }, transaction) => {
  switch (audience) {
    case A.SECTION: {
      const items = await RegistrationItem.findAll({
        where: { courseSectionId, status: REGISTRATION_ITEM_STATUS.REGISTERED },
        include: [{
          model: Registration, as: 'registration', where: liveRegistration, attributes: ['id'],
          include: [{ model: Student, as: 'student', attributes: ['userId'] }],
        }],
        transaction,
      });
      return items.map((i) => i.registration.student.userId);
    }
    case A.PROGRAM:
      return (await Student.findAll({
        where: { programId },
        attributes: ['userId'],
        include: [{ model: User, as: 'user', where: { status: USER_STATUS.ACTIVE }, attributes: [] }],
        transaction,
      })).map((s) => s.userId);
    case A.ALL_STUDENTS: return activeUsersWithRoles([ROLES.USER], transaction);
    case A.ALL_LECTURERS: return activeUsersWithRoles([ROLES.LECTURER], transaction);
    case A.ALL_STAFF: return activeUsersWithRoles(STAFF_ROLES, transaction);
    default: return activeUsersWithRoles(null, transaction);
  }
};

/** Lecturers post only to sections they teach; other roles with the permission may post to any audience. */
const assertCanTarget = async (data, actor) => {
  if (actor.role === ROLES.LECTURER) {
    if (data.audience !== A.SECTION) throw new ForbiddenError('Lecturers can only post to their own sections');
    const lecturer = await lecturerService.getByUserId(actor.id);
    const section = await CourseSection.findByPk(data.courseSectionId, { attributes: ['id', 'lecturerId'] });
    if (!section) throw new BadRequestError('Section does not exist');
    if (section.lecturerId !== lecturer.id) throw new ForbiddenError('You do not teach this section');
    return;
  }
  if (data.audience === A.SECTION && !(await CourseSection.findByPk(data.courseSectionId, { attributes: ['id'] }))) {
    throw new BadRequestError('Section does not exist');
  }
  if (data.audience === A.PROGRAM && !(await Program.findByPk(data.programId, { attributes: ['id'] }))) {
    throw new BadRequestError('Program does not exist');
  }
};

const getById = async (id) => {
  const announcement = await Announcement.findByPk(id, { include: includes });
  if (!announcement) throw new NotFoundError('Announcement');
  return announcement;
};

export const create = async (data, actor, req) => {
  await assertCanTarget(data, actor);
  const id = await sequelize.transaction(async (transaction) => {
    const announcement = await Announcement.create({
      authorId: actor.id,
      title: data.title,
      body: data.body,
      audience: data.audience,
      courseSectionId: data.audience === A.SECTION ? data.courseSectionId : null,
      programId: data.audience === A.PROGRAM ? data.programId : null,
      pinned: data.pinned ?? false,
    }, { transaction });

    const userIds = [...new Set(await recipients(announcement, transaction))].filter((uid) => uid !== actor.id);
    await notificationService.createMany({
      userIds,
      type: 'ANNOUNCEMENT',
      title: announcement.title,
      message: announcement.body.length > 280 ? `${announcement.body.slice(0, 277)}…` : announcement.body,
      data: { announcementId: announcement.id },
    }, { transaction });
    await announcement.update({ recipientCount: userIds.length }, { transaction });

    await audit.log({
      userId: actor.id, action: 'announcement.create', entityType: 'Announcement', entityId: announcement.id,
      metadata: { audience: announcement.audience, recipients: userIds.length }, req, transaction,
    });
    return announcement.id;
  });
  return getById(id);
};

/** Which announcements a user should see: their audiences, their program and sections, and their own posts. */
const feedWhere = async (user) => {
  const or = [{ audience: A.EVERYONE }, { authorId: user.id }];
  if (user.role === ROLES.USER) {
    or.push({ audience: A.ALL_STUDENTS });
    const student = await Student.findOne({ where: { userId: user.id }, attributes: ['id', 'programId'] });
    if (student) {
      or.push({ audience: A.PROGRAM, programId: student.programId });
      const items = await RegistrationItem.findAll({
        where: { status: REGISTRATION_ITEM_STATUS.REGISTERED },
        attributes: ['courseSectionId'],
        include: [{ model: Registration, as: 'registration', where: { studentId: student.id, ...liveRegistration }, attributes: [] }],
      });
      if (items.length) or.push({ audience: A.SECTION, courseSectionId: items.map((i) => i.courseSectionId) });
    }
  }
  if (user.role === ROLES.LECTURER) {
    or.push({ audience: A.ALL_LECTURERS });
    const lecturer = await lecturerService.getByUserId(user.id).catch(() => null);
    if (lecturer) {
      const sections = await CourseSection.findAll({ where: { lecturerId: lecturer.id }, attributes: ['id'] });
      if (sections.length) or.push({ audience: A.SECTION, courseSectionId: sections.map((s) => s.id) });
    }
  }
  if (STAFF_ROLES.includes(user.role)) or.push({ audience: A.ALL_STAFF });
  return { [Op.or]: or };
};

const list = async (where, query) => {
  const { page, limit, offset } = buildPagination(query);
  const result = await Announcement.findAndCountAll({
    where, include: includes, limit, offset, distinct: true,
    order: [['pinned', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']],
  });
  return { result, page, limit };
};

export const feed = async (user, query) => list(await feedWhere(user), query);
export const mine = async (user, query) => list({ authorId: user.id }, query);

/** The author may edit or delete; so may any non-lecturer who can post announcements (moderation). */
const loadEditable = async (id, actor) => {
  const announcement = await getById(id);
  const moderator = actor.role !== ROLES.LECTURER && hasPermission(actor.role, PERMISSIONS.ANNOUNCEMENT_CREATE);
  if (announcement.authorId !== actor.id && !moderator) throw new ForbiddenError('You can only change your own announcements');
  return announcement;
};

export const update = async (id, data, actor, req) => {
  const announcement = await loadEditable(id, actor);
  await announcement.update(data);
  await audit.log({ userId: actor.id, action: 'announcement.update', entityType: 'Announcement', entityId: announcement.id, metadata: data, req });
  return getById(id);
};

export const remove = async (id, actor, req) => {
  const announcement = await loadEditable(id, actor);
  await announcement.destroy();
  await audit.log({
    userId: actor.id, action: 'announcement.delete', entityType: 'Announcement', entityId: announcement.id,
    metadata: { title: announcement.title }, req,
  });
};
