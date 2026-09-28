import * as announcementService from '../services/announcement.service.js';
import { ok, created, noContent, paginated } from '../utils/response.js';

export const feed = async (req, res) => {
  const { result, page, limit } = await announcementService.feed(req.user, req.validated.query);
  return paginated(res, result, { page, limit });
};
export const mine = async (req, res) => {
  const { result, page, limit } = await announcementService.mine(req.user, req.validated.query);
  return paginated(res, result, { page, limit });
};
export const create = async (req, res) => created(res, await announcementService.create(req.validated.body, req.user, req));
export const update = async (req, res) =>
  ok(res, await announcementService.update(req.validated.params.id, req.validated.body, req.user, req));
export const remove = async (req, res) => {
  await announcementService.remove(req.validated.params.id, req.user, req);
  return noContent(res);
};
