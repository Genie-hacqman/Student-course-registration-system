import * as registrationService from '../services/registration.service.js';
import { ok, created, paginated } from '../utils/response.js';

export const current = async (req, res) => ok(res, await registrationService.getCurrent(req.user.id));
export const availableCourses = async (req, res) =>
  ok(res, await registrationService.getAvailableCourses(req.user.id, req.validated.query));
export const addItem = async (req, res) =>
  created(res, await registrationService.addItem(req.user.id, req.validated.body.courseSectionId, req));
export const dropItem = async (req, res) => ok(res, await registrationService.dropItem(req.user.id, req.validated.params.itemId, req));
export const submit = async (req, res) => ok(res, await registrationService.submit(req.user.id, req));
export const history = async (req, res) => ok(res, await registrationService.history(req.user.id));

// Staff
export const list = async (req, res) => {
  const { result, page, limit } = await registrationService.listAll(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const getById = async (req, res) => ok(res, await registrationService.getById(req.validated.params.id));
export const approve = async (req, res) =>
  ok(res, await registrationService.approve(req.validated.params.id, req.validated.body.remarks, req.user, req));
export const reject = async (req, res) =>
  ok(res, await registrationService.reject(req.validated.params.id, req.validated.body.remarks, req.user, req));

export const staffAdd = async (req, res) =>
  created(res, await registrationService.staffAddStudent(req.validated.params.id, req.validated.body, req.user, req));
export const staffRemove = async (req, res) =>
  ok(res, await registrationService.staffRemoveStudent(req.validated.params.id, req.validated.params.studentId, req.validated.body, req.user, req));
