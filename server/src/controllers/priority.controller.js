import * as priorityService from '../services/priority.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const listWindows = async (req, res) => ok(res, await priorityService.listWindows(req.validated.params.id));
export const createWindow = async (req, res) =>
  created(res, await priorityService.createWindow(req.validated.params.id, req.validated.body, req.user));
export const updateWindow = async (req, res) =>
  ok(res, await priorityService.updateWindow(req.validated.params.id, req.validated.params.windowId, req.validated.body, req.user));
export const deleteWindow = async (req, res) => {
  await priorityService.deleteWindow(req.validated.params.id, req.validated.params.windowId, req.user);
  return noContent(res);
};
export const listOverrides = async (req, res) => ok(res, await priorityService.listOverrides(req.validated.params.id));
export const setOverride =async (req, res) => ok(res, await priorityService.setOverride(req.validated.params.id, req.validated.body, req.user));
export const removeOverride = async (req, res) => {
  await priorityService.removeOverride(req.validated.params.id, req.validated.params.studentId, req.user);
  return noContent(res);
};
