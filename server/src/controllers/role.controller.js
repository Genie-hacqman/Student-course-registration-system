import * as roleService from '../services/role.service.js';
import { ok } from '../utils/response.js';

export const list = async (req, res) => ok(res, await roleService.list());
export const permissions = async (req, res) => ok(res, roleService.catalog());
export const setPermissions = async (req, res) =>
  ok(res, await roleService.setPermissions(req.validated.params.id, req.validated.body.permissions, req.user, req));
