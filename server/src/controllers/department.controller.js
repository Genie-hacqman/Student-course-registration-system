import * as departmentService from '../services/department.service.js';
import * as studentService from '../services/student.service.js';
import * as lecturerService from '../services/lecturer.service.js';
import { ok, created, noContent, paginated } from '../utils/response.js';
import { ORG_STATUS } from '../utils/constants.js';

export const list = async (req, res) => ok(res, await departmentService.list(req.validated.query));
export const getById = async (req, res) => ok(res, await departmentService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await departmentService.create(req.validated.body, req.user, req));
export const update = async (req, res) => ok(res, await departmentService.update(req.validated.params.id, req.validated.body, req.user, req));
export const remove = async (req, res) => {
  await departmentService.remove(req.validated.params.id, req.user, req);
  return noContent(res);
};

// Directory: counts and drill-down.
export const summary = async (req, res) => {
  const { result, page, limit } = await departmentService.summary(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const overview = async (req, res) => ok(res, await departmentService.overview(req.validated.params.id));
export const students = async (req, res) => {
  await departmentService.getById(req.validated.params.id); // 404 for an unknown department
  const { result, page, limit } = await studentService.list({ ...req.validated.query, departmentId: req.validated.params.id });
  return paginated(res, result, { page, limit });
};
export const lecturers = async (req, res) => {
  const { result, page, limit } = await lecturerService.listForDepartment(req.validated.params.id, req.validated.query);
  return paginated(res, result, { page, limit });
};
export const archive = async (req, res) => ok(res, await departmentService.setStatus(req.validated.params.id, ORG_STATUS.ARCHIVED, req.user, req));
export const activate = async (req, res) => ok(res, await departmentService.setStatus(req.validated.params.id, ORG_STATUS.ACTIVE, req.user, req));
