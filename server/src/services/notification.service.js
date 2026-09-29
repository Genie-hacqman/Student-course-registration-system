import { Notification, User } from '../models/index.js';
import { emitNotification } from '../sockets/notification.socket.js';
import { buildPagination } from '../utils/pagination.js';
import { NotFoundError } from '../utils/errors.js';
import logger from '../config/logger.js';
import { sendTemplate } from './mail.service.js';

/**
 * Notification types worth an email, not just an in-app badge — status changes, anything
 * time-sensitive, and confirmations of an important submission. Types tied to a small action the user
 * just took (COURSE_REGISTERED, PREREQUISITE_OVERRIDE, REGISTRATION_TIME) stay in-app only.
 */
const EMAILED_TYPES = new Set([
  'REGISTRATION_SUBMITTED',
  'REGISTRATION_APPROVED',
  'REGISTRATION_REJECTED',
  'WAITLIST_SEAT_AVAILABLE',
  'GRADES_RELEASED',
  'GRADE_AMENDED',
  // Timetable changes.
  'SECTION_RESCHEDULED',
  'SECTION_CANCELLED',
  // Done to the student by staff, so they may not know yet.
  'COURSE_ADDED_BY_STAFF',
  'COURSE_DROPPED_BY_STAFF',
  'ACCOUNT_REQUEST_APPROVED',
  'ACCOUNT_REQUEST_REJECTED',
  // Sent to the applicant's personal email (their account email until admission).
  'APPLICATION_REJECTED',
  // Administrative alerts to admins.
  'ACCOUNT_REQUEST_CREATED',
  'APPLICATION_SUBMITTED',
]);

export const isEmailable = (type) => EMAILED_TYPES.has(type);

const ADMIN_PATHS = { ACCOUNT_REQUEST_CREATED: '/staff/account-requests', APPLICATION_SUBMITTED: '/staff/applications' };

/** Which template renders a notification type, and its data. */
const templateFor = (n, user) => {
  const d = n.data ?? {};
  switch (n.type) {
    case 'REGISTRATION_SUBMITTED':
      return ['registrationSubmitted', { name: user.firstName, reference: d.reference, semester: d.semester, credits: d.credits, needsApproval: d.needsApproval }];
    case 'REGISTRATION_APPROVED':
    case 'REGISTRATION_REJECTED':
      return ['registrationDecision', { name: user.firstName, approved: n.type === 'REGISTRATION_APPROVED', reason: d.reason }];
    case 'APPLICATION_REJECTED':
      return ['applicationDecision', { name: user.firstName, reason: d.reason }];
    case 'SECTION_RESCHEDULED':
    case 'SECTION_CANCELLED':
      return ['timetableChange', { name: user.firstName, title: n.title, message: n.message }];
    case 'ACCOUNT_REQUEST_CREATED':
    case 'APPLICATION_SUBMITTED':
      return ['adminAlert', { title: n.title, message: n.message, path: ADMIN_PATHS[n.type] }];
    default:
      return ['notification', { name: user.firstName, title: n.title, message: n.message }];
  }
};

/**
 * Emails a notification with its template. Keyed on the notification id, so it's sent at most once.
 * Never throws: a failed email must not affect the notification that was already saved.
 */
const emailNotification = async (notification) => {
  if (!isEmailable(notification.type)) return;
  try {
    const user = await User.findByPk(notification.userId, { attributes: ['id', 'email', 'firstName'] });
    if (!user) return;
    const [template, data] = templateFor(notification, user);
    await sendTemplate(template, data, {
      to: user.email,
      idempotencyKey: `notification:${notification.id}`,
      userId: user.id,
      entityType: 'Notification',
      entityId: notification.id,
    });
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
