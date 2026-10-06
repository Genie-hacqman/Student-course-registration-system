import * as auditService from '../services/audit.service.js';
import * as settingService from '../services/setting.service.js';
import { ok, paginated } from '../utils/response.js';

export const auditLogs = async (req, res) => {
  const { result, page, limit } = await auditService.list(req.validated.query);
  return paginated(res, result, { page, limit });
};

export const auditLogOptions = async (req, res) => ok(res, await auditService.filterOptions());

export const settings = async (req, res) => ok(res, await settingService.list());
export const updateSettings = async (req, res) => ok(res, await settingService.upsertMany(req.validated.body.settings, req.user));

export const signIns = async (req, res) => {
  const { result, page, limit } = await auditService.listSignIns(req.validated.query);
  return paginated(res, result, { page, limit });
};
