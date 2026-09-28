import * as notificationService from '../services/notification.service.js';
import { ok } from '../utils/response.js';

export const list = async (req, res) => {
  const { result, page, limit, unreadCount } = await notificationService.listForUser(req.user.id, req.validated.query);
  return ok(res, result.rows, {
    page, limit, total: result.count, totalPages: Math.ceil(result.count / limit), unreadCount,
  });
};
export const markRead = async (req, res) => ok(res, await notificationService.markRead(req.user.id, req.validated.params.id));
export const markAllRead = async (req, res) => ok(res, await notificationService.markAllRead(req.user.id));
