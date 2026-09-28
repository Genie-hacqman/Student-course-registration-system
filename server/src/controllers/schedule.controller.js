import * as scheduleService from '../services/schedule.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const list = async (req, res) => ok(res, await scheduleService.list(req.validated.query));
export const getById = async (req, res) => ok(res, await scheduleService.getById(req.validated.params.id));
export const create = async (req, res) => created(res, await scheduleService.create(req.validated.body, req.user));
export const update = async (req, res) => ok(res, await scheduleService.update(req.validated.params.id, req.validated.body, req.user));
export const remove = async (req, res) => {
  await scheduleService.remove(req.validated.params.id, req.user);
  return noContent(res);
};
