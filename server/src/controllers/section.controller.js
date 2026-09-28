import * as sectionService from '../services/section.service.js';
import { ok, created, noContent, paginated } from '../utils/response.js';

export const list = async (req, res) => {
  const { result, page, limit } = await sectionService.list(req.validated.query, req.user);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await sectionService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await sectionService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await sectionService.update(req.validated.params.id, req.validated.body, req.user));
export const remove = async (req, res) => {
  await sectionService.remove(req.validated.params.id, req.user);
  return noContent(res);
};
