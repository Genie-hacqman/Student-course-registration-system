import * as programService from '../services/program.service.js';
import * as studentService from '../services/student.service.js';
import { ok, created, noContent, paginated } from '../utils/response.js';
import { ORG_STATUS } from '../utils/constants.js';

export const list = async (req, res) => ok(res, await programService.list(req.validated.query));
export const getById = async (req, res) => ok(res, await programService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await programService.create(req.validated.body, req.user, req));
export const update = async (req, res) => ok(res, await programService.update(req.validated.params.id, req.validated.body, req.user, req));
export const remove = async (req, res) => {
  await programService.remove(req.validated.params.id, req.user, req);
  return noContent(res);
};

export const students = async (req, res) => {
  await programService.getById(req.validated.params.id);
  const { result, page, limit } = await studentService.list({ ...req.validated.query, programId: req.validated.params.id });
  return paginated(res, result, { page, limit });
};
export const archive = async (req, res) => ok(res, await programService.setStatus(req.validated.params.id, ORG_STATUS.ARCHIVED, req.user, req));
export const activate = async (req, res) => ok(res, await programService.setStatus(req.validated.params.id, ORG_STATUS.ACTIVE, req.user, req));

export const listCourses = async (req, res) => ok(res, await programService.listCourses(req.validated.params.id));
export const addCourse = async (req, res) =>
  created(res, await programService.addCourse(req.validated.params.id, req.validated.body, req.user));
export const removeCourse = async (req, res) => {
  await programService.removeCourse(req.validated.params.id, req.validated.params.courseId, req.user);
  return noContent(res);
};
