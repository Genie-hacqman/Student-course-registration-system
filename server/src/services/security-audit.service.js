import * as audit from './audit.service.js';
import { seenRecently } from '../utils/ttl-set.js';

/**
 * The audit entries that are signals rather than business changes: a denied request, a hit rate limit, a staff
 * member opening someone else's sensitive record, an admin opening the audit log itself.
 *
 * All are best-effort (no transaction, so a failure is reported but never fails the request) and all are
 * de-duplicated for a window, because a stale page polling a forbidden URL, or a photo shown in several places,
 * would otherwise write the same row over and over. Never put secrets, tokens or storage keys in metadata.
 */

const TEN_MINUTES = 10 * 60 * 1000;

/** `/api/students/42/results?x=1` -> `/api/students/:id/results`: ids and query strings never reach the log. */
export const routeShape = (req) => (req.originalUrl ?? req.url ?? '').split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');

/**
 * A signed-in user was refused (403). `req.accessDenied` is set by the permission and role middleware with what
 * was required; a 403 thrown from inside a service has none and is labelled as such.
 */
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

/** Called by a rate limiter on the first blocked request of a window (see createLimiter). */
export const recordRateLimited = async (req, { limiter, limit, windowMs }) => {
  await audit.log({
    userId: req.user?.id ?? null,
    action: 'security.rate_limited',
    metadata: { limiter, method: req.method, path: routeShape(req), limit, windowMs },
  });
};

/**
 * Staff opened another person's sensitive record. The viewer is never the owner (callers check), and the same
 * viewer opening the same record again within ten minutes is one row.
 */
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

/**
 * An admin opened the audit log, sign-ins or email log. Only the first page of a distinct filter set counts, so
 * paging and refreshing are not a stream of rows; the filters recorded are the whitelisted ones, never free text.
 */
export const recordAuditViewed = async (req, view, query = {}) => {
  if (!req.user || (query.page && Number(query.page) > 1)) return;
  const filters = Object.fromEntries(FILTER_KEYS[view].filter((k) => query[k] !== undefined && query[k] !== '').map((k) => [k, query[k]]));
  if (seenRecently(`audit-viewed|${req.user.id}|${view}|${JSON.stringify(filters)}`, TEN_MINUTES)) return;
  await audit.log({ userId: req.user.id, action: 'audit.viewed', metadata: { view, filters } });
};
