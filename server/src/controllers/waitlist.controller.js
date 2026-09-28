import * as waitlistService from '../services/waitlist.service.js';
import { ok, created, noContent } from '../utils/response.js';

export const join = async (req, res) => created(res, await waitlistService.join(req.user.id, req.validated.body.courseSectionId));
export const mine = async (req, res) => ok(res, await waitlistService.listMine(req.user.id));
export const leave = async (req, res) => {
  await waitlistService.leave(req.user.id, req.validated.params.id);
  return noContent(res);
};
