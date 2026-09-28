import * as studentService from '../services/student.service.js';
import { ok, created, paginated } from '../utils/response.js';

export const me = async (req, res) => ok(res, await studentService.getByUserId(req.user.id));
export const myResults = async (req, res) => {
  const student = await studentService.getByUserId(req.user.id);
  return ok(res, await studentService.getResults(student.id));
};

export const list = async (req, res) => {
  const { result, page, limit } = await studentService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await studentService.getById(req.validated.params.id));
export const results = async (req, res) => ok(res, await studentService.getResults(req.validated.params.id, { finalOnly: false }));
export const create = async (req, res) => created(res, await studentService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await studentService.update(req.validated.params.id, req.validated.body, req.user));
