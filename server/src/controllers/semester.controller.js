import * as semesterService from '../services/semester.service.js';
import { ok, created, paginated } from '../utils/response.js';

export const listAcademicYears = async (req, res) => ok(res, await semesterService.listAcademicYears());
export const createAcademicYear = async (req, res) => created(res, await semesterService.createAcademicYear(req.validated.body, req.user));
export const updateAcademicYear = async (req, res) =>
  ok(res, await semesterService.updateAcademicYear(req.validated.params.id, req.validated.body, req.user));

export const list = async (req, res) => {
  const { result, page, limit } = await semesterService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const current = async (req, res) => ok(res, await semesterService.getCurrent());
export const getById = async (req, res) => ok(res, await semesterService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await semesterService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await semesterService.update(req.validated.params.id, req.validated.body, req.user));
