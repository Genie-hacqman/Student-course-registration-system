import * as audit from './audit.service.js';
import { seenRecently } from '../utils/ttl-set.js';

const TEN_MINUTES = 10 * 60 * 1000;

export const routeShape = (req) => (req.originalUrl ?? req.url ?? '').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');

export const recordAccessDenied = async (req) => {
  if (!req.user) return;
  const path = routeShape(req);
  if (seenRecently(`denied|${req.user.id}|${req.method}|${path}`, TEN_MINUTES)) return;
  await audit.log({
    userId: req.user.id,
    action: 'security.access_denied',
    metadata: {
      method: req.method,
      path,
      required: req.accessDenied?.required ?? null,
      source: req.accessDenied ? req.accessDenied.kind : 'service',
    },
  });
};

export const recordRateLimited = async (req, { limiter, limit, windowMs }) => {
  await audit.log({
    userId: req.user?.id ?? null,
    action: 'security.rate_limited',
    metadata: { limiter, method: req.method, path: routeShape(req), limit, windowMs },
  });
};

export const recordStaffView = async (req, { action, entityType, entityId, metadata }) => {
  if (!req.user) return;
  if (seenRecently(`view|${action}|${req.user.id}|${entityType}|${entityId}`, TEN_MINUTES)) return;
  await audit.log({ userId: req.user.id, action, entityType, entityId, metadata });
};

const FILTER_KEYS = {
  audit_log: ['action', 'actionPrefix', 'entityType', 'entityId', 'userId', 'requestId', 'from', 'to'],
  sign_ins: ['userId', 'role', 'result', 'from', 'to'],
  email_deliveries: ['status', 'template'],
};

export const recordAuditViewed = async (req, view, query = {}) => {
  if (!req.user || (query.page && Number(query.page) > 1)) return;
  const filters = Object.fromEntries(FILTER_KEYS[view].filter((k) => query[k] !== undefined && query[k] !== '').map((k) => [k, query[k]]));
  if (seenRecently(`audit-viewed|${req.user.id}|${view}|${JSON.stringify(filters)}`, TEN_MINUTES)) return;
  await audit.log({ userId: req.user.id, action: 'audit.viewed', metadata: { view, filters } });
};
