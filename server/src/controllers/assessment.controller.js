import * as assessmentService from '../services/assessment.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const listForSection = async (req, res) => ok(res, await assessmentService.listForSection(req.validated.params.id, req.user));
export const create = async (req, res) =>
  created(res, await assessmentService.create(req.validated.params.id, req.validated.body, req.user, req));
export const update = async (req, res) =>
  ok(res, await assessmentService.update(req.validated.params.id, req.validated.body, req.user, req));
export const remove = async (req, res) => {
  await assessmentService.remove(req.validated.params.id, req.user, req);
  return noContent(res);
};
export const scores = async (req, res) => ok(res, await assessmentService.getScores(req.validated.params.id, req.user));
export const setScores = async (req, res) =>
  ok(res, await assessmentService.setScores(req.validated.params.id, req.validated.body.scores, req.user, req));
export const publish = async (req, res) => ok(res, await assessmentService.publish(req.validated.params.id, req.user, req));
export const mine = async (req, res) => ok(res, await assessmentService.forStudent(req.user.id));
