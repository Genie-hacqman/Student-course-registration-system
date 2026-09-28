import * as programService from '../services/program.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const list = async (req, res) => ok(res, await programService.list(req.validated.query));
export const getById = async (req, res) => ok(res, await programService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await programService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await programService.update(req.validated.params.id, req.validated.body, req.user));
export const remove = async (req, res) => {
  await programService.remove(req.validated.params.id, req.user);
  return noContent(res);
};

export const listCourses = async (req, res) => ok(res, await programService.listCourses(req.validated.params.id));
export const addCourse = async (req, res) =>
  created(res, await programService.addCourse(req.validated.params.id, req.validated.body, req.user));
export const removeCourse = async (req, res) => {
  await programService.removeCourse(req.validated.params.id, req.validated.params.courseId, req.user);
  return noContent(res);
};
