import * as studentService from '../services/student.service.js';
import { recordStaffView } from '../services/security-audit.service.js';
import { ROLES } from '../utils/constants.js';
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
export const summary = async (req, res) => ok(res, await studentService.summary(req.validated.query));
export const results = async (req, res) => {
  const data = await studentService.getResults(req.validated.params.id, { finalOnly: false });
  // Includes provisional grades the student cannot see yet. A student reads their own results through
  // myResults, so a STUDENT arriving here (only if an admin granted them view_all) is not logged as staff.
  if (req.user.role !== ROLES.STUDENT) {
    await recordStaffView(req, { action: 'student.results_viewed', entityType: 'Student', entityId: req.validated.params.id, metadata: { includesProvisional: true } });
  }
  return ok(res, data);
};
export const create = async (req, res) => created(res, await studentService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await studentService.update(req.validated.params.id, req.validated.body, req.user));
