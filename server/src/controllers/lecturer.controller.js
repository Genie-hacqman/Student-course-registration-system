import * as lecturerService from '../services/lecturer.service.js';
import * as teachingService from '../services/teaching.service.js';
import { ok, created, paginated, noContent } from '../utils/response.js';

export const list = async (req, res) => {
  const { result, page, limit } = await lecturerService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await lecturerService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await lecturerService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await lecturerService.update(req.validated.params.id, req.validated.body, req.user));
export const setDepartments = async (req, res) =>
  ok(res, await lecturerService.setDepartments(req.validated.params.id, req.validated.body.departmentIds, req.user, req));
export const activate = async (req, res) => ok(res, await lecturerService.setActive(req.validated.params.id, true, req.user));
export const deactivate = async (req, res) => ok(res, await lecturerService.setActive(req.validated.params.id, false, req.user));
export const invite = async (req, res) => {
  await lecturerService.resendInvite(req.validated.params.id, req.user);
  return noContent(res);
};

export const mySections = async (req, res) => {
  const lecturer = await lecturerService.getByUserId(req.user.id);
  return ok(res, await lecturerService.getSections(lecturer.id, req.validated.query.semesterId));
};
export const roster = async (req, res) => ok(res, await lecturerService.getRoster(req.validated.params.id, req.user));
export const myTasks = async (req, res) => ok(res, await teachingService.tasksFor(req.user.id));
