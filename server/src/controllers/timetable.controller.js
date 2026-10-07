import * as timetableService from '../services/timetable.service.js';
import { ok, paginated } from '../utils/response.js';

export const mine = async (req, res) => ok(res, await timetableService.forStudent(req.user.id, req.validated.query.semesterId));
export const lecturerMine = async (req, res) =>
  ok(res, await timetableService.forLecturer(req.user.id, req.validated.query.semesterId));

export const listIssues = async (req, res) => {
  const { result, page, limit } = await timetableService.listIssues(req.validated.query);
  return paginated(res, result, { page, limit });
};
export const resolveIssue = async (req, res) =>
  ok(res, await timetableService.resolveIssue(req.validated.params.id, req.validated.body, req.user, req));
