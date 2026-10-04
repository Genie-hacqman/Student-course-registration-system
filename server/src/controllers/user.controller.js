import * as userService from '../services/user.service.js';
import * as authService from '../services/auth.service.js';
import { ok, created, paginated, noContent } from '../utils/response.js';

export const list = async (req, res) => {
  const { result, page, limit } = await userService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await userService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await userService.create(req.validated.body, req.user, req));
export const update = async (req, res) => ok(res, await userService.update(req.validated.params.id, req.validated.body, req.user, req));
export const roleResponsibilities = async (req, res) => ok(res, userService.roleResponsibilities());
export const invite = async (req, res) => {
  await userService.invite(req.validated.params.id, req.user);
  return noContent(res);
};
export const deactivate = async (req, res) => ok(res, await userService.deactivate(req.validated.params.id, req.user, req));

export const sessions = async (req, res) => {
  await userService.getById(req.validated.params.id);
  return ok(res, await authService.listSessions(req.validated.params.id, null));
};
export const endSession = async (req, res) => {
  await authService.endSession(req.validated.params.id, req.validated.params.sessionId, null, req, req.user);
  return noContent(res);
};
