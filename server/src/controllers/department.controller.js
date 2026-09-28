import * as departmentService from '../services/department.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const list = async (req, res) => ok(res, await departmentService.list());
export const getById = async (req, res) => ok(res, await departmentService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await departmentService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await departmentService.update(req.validated.params.id, req.validated.body, req.user));
export const remove = async (req, res) => {
  await departmentService.remove(req.validated.params.id, req.user);
  return noContent(res);
};
