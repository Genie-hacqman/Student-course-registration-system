import * as attendanceService from '../services/attendance.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const listForSection = async (req, res) => ok(res, await attendanceService.listForSection(req.validated.params.id, req.user));
export const create = async (req, res) =>
  created(res, await attendanceService.createSession(req.validated.params.id, req.validated.body, req.user, req));
export const getById = async (req, res) => ok(res, await attendanceService.getSession(req.validated.params.id, req.user));
export const update = async (req, res) =>
  ok(res, await attendanceService.updateSession(req.validated.params.id, req.validated.body, req.user, req));
export const remove = async (req, res) => {
  await attendanceService.removeSession(req.validated.params.id, req.user, req);
  return noContent(res);
};
export const mine = async (req, res) => ok(res, await attendanceService.forStudent(req.user.id));
