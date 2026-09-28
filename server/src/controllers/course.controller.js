import * as courseService from '../services/course.service.js';
import { ok, created, noContent, paginated } from '../utils/response.js';

export const list = async (req, res) => {
  const { result, page, limit } = await courseService.list(req.validated.query, req.user);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await courseService.getById(req.validated.params.id, req.user));
export const create = async (req, res) => created(res, await courseService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await courseService.update(req.validated.params.id, req.validated.body, req.user));
export const remove = async (req, res) => {
  await courseService.remove(req.validated.params.id, req.user);
  return noContent(res);
};
