import { Notification, User } from '../models/index.js';
import { emitNotification } from '../sockets/notification.socket.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError } from '../utils/errors.js';
import logger from '../config/logger.js';
import * as emailService from './email.service.js';

/**
 * Notification types worth an email, not just an in-app badge — things a student needs to know
 * even when they aren't actively in the app. Deliberately excludes types tied to an action the
 * user just took (COURSE_REGISTERED, REGISTRATION_SUBMITTED, PREREQUISITE_OVERRIDE,
 * REGISTRATION_TIME), where the in-app confirmation already reached them.
 */
const EMAILED_TYPES = new Set([
  'REGISTRATION_APPROVED',
  'REGISTRATION_REJECTED',
  'WAITLIST_SEAT_AVAILABLE',
  'GRADES_RELEASED',
  'GRADE_AMENDED',
  // Done to the student by staff, so they may not know yet.
  'COURSE_ADDED_BY_STAFF',
  'COURSE_DROPPED_BY_STAFF',
  'ACCOUNT_REQUEST_APPROVED',
  'ACCOUNT_REQUEST_REJECTED',
  // Sent to the applicant's personal email (their account email until admission).
  'APPLICATION_REJECTED',
]);

export const isEmailable = (type) => EMAILED_TYPES.has(type);

/** Never throws: a failed email must not affect the notification that was already saved. */
const emailNotification = async (notification) => {
  if (!isEmailable(notification.type)) return;
  try {
    const user = await User.findByPk(notification.userId, { attributes: ['email'] });
    if (!user) return;
    await emailService.sendMail({ to: user.email, subject: notification.title, text: notification.message });
  } catch (err) {
    logger.error(`Failed to email notification ${notification.id}:`, err.message);
  }
};

/** Creates a notification, pushes it over Socket.IO, and emails it (if its type warrants one), once the (optional) transaction commits. */
export const create = async ({ userId, type, title, message, data }, { transaction } = {}) => {
  const notification = await Notification.create({ userId, type, title, message, data }, { transaction });
  const afterCommit = () => {
    emitNotification(notification);
    emailNotification(notification);
  };
  if (transaction) transaction.afterCommit(afterCommit);
  else afterCommit();
  return notification;
};

/** The same notification for many users at once (announcements, published assessments), in one insert. */
export const createMany = async ({ userIds, type, title, message, data }, { transaction } = {}) => {
  if (!userIds.length) return [];
  const notifications = await Notification.bulkCreate(
    userIds.map((userId) => ({ userId, type, title, message, data })),
    { transaction },
  );
  const afterCommit = () => notifications.forEach((n) => {
    emitNotification(n);
    emailNotification(n);
  });
  if (transaction) transaction.afterCommit(afterCommit);
  else afterCommit();
  return notifications;
};

export const listForUser = async (userId, query) => {
  const { page, limit, offset } = buildPagination(query);
  const where = { userId };
  if (query.unread === true) where.readAt = null;

  const [result, unreadCount] = await Promise.all([
    Notification.findAndCountAll({ where, limit, offset, order: [['createdAt', 'DESC'], ['id', 'DESC']] }),
    Notification.count({ where: { userId, readAt: null } }),
  ]);
  return { result, page, limit, unreadCount };
};

export const markRead = async (userId, id) => {
  const notification = await Notification.findOne({ where: { id, userId } });
  if (!notification) throw new NotFoundError('Notification');
  if (!notification.readAt) await notification.update({ readAt: new Date() });
  return notification;
};

export const markAllRead = async (userId) => {
  const [updated] = await Notification.update({ readAt: new Date() }, { where: { userId, readAt: null } });
  return { updated };
};
