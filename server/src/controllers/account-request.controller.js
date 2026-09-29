import * as accountRequestService from '../services/account-request.service.js';
import { ok, created, paginated } from '../utils/response.js';

// Self-service (anyone who needs approval; admins and applying students change things directly)
export const createForSelf = async (req, res) => created(res, await accountRequestService.createForSelf(req.user.id, req.validated.body, req));
export const listForSelf = async (req, res) => ok(res, await accountRequestService.listForSelf(req.user.id));
export const cancel = async (req, res) => ok(res, await accountRequestService.cancel(req.user.id, req.validated.params.id, req));

// Admin queue (account:approve)
export const list = async (req, res) => {
  const { result, page, limit } = await accountRequestService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const approve = async (req, res) => ok(res, await accountRequestService.approve(req.validated.params.id, req.validated.body.note, req.user, req));
export const reject = async (req, res) => ok(res, await accountRequestService.reject(req.validated.params.id, req.validated.body.note, req.user, req));
