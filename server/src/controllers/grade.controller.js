import * as gradeService from '../services/grade.service.js';
import { ok } from '../utils/response.js';

export const sectionGrades = async (req, res) => ok(res, await gradeService.getSectionGrades(req.validated.params.id, req.user));
export const enter = async (req, res) =>
  ok(res, await gradeService.enterGrades(req.validated.params.id, req.validated.body.grades, req.user, req));
export const finalize = async (req, res) => ok(res, await gradeService.finalizeGrades(req.validated.params.id, req.user, req));
export const amend = async (req, res) => ok(res, await gradeService.amendResult(req.validated.params.id, req.validated.body, req.user, req));
export const importResults = async (req, res) => ok(res, await gradeService.importResults(req.validated.body.results, req.user, req));
