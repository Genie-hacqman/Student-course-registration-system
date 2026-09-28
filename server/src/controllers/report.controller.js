import * as reportService from '../services/report.service.js';
import { ok } from '../utils/response.js';

export const coursePopularity = async (req, res) => ok(res, await reportService.coursePopularity(req.validated.query));
export const registrationSummary = async (req, res) => ok(res, await reportService.registrationSummary(req.validated.query));
export const overview = async (req, res) => ok(res, await reportService.overview(req.validated.query, req.user));
