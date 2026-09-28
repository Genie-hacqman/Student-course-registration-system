import * as prerequisiteService from '../services/prerequisite.service.js';
import * as studentService from '../services/student.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const list = async (req, res) => ok(res, await prerequisiteService.list(req.validated.params.courseId));

export const add = async (req, res) =>
  created(res, await prerequisiteService.add(req.validated.params.courseId, req.validated.body, req.user));

export const remove = async (req, res) => {
  const { courseId, prerequisiteId } = req.validated.params;
  await prerequisiteService.remove(courseId, prerequisiteId, req.user);
  return noContent(res);
};

export const check = async (req, res) => {
  const student = await studentService.getByUserId(req.user.id);
  return ok(res, await prerequisiteService.check(student.id, req.validated.params.courseId));
};

// Overrides: waive a course's requirements for one student.
export const listOverrides = async (req, res) => ok(res, await prerequisiteService.listOverrides(req.validated.params.id));
export const grantOverride = async (req, res) =>
  created(res, await prerequisiteService.grantOverride(req.validated.params.id, req.validated.body, req.user, req));
export const revokeOverride = async (req, res) => {
  await prerequisiteService.revokeOverride(req.validated.params.id, req.validated.params.overrideId, req.user, req);
  return noContent(res);
};
