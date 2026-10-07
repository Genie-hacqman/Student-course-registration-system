import { UniqueConstraintError, ForeignKeyConstraintError, ValidationError as SequelizeValidationError } from 'sequelize';
import { AppError } from '../utils/errors.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { captureException } from '../config/sentry.js';
import { recordAccessDenied } from '../services/security-audit.service.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'ROUTE_NOT_FOUND', message: `Cannot ${req.method} ${req.originalUrl}` },
    requestId: req.id,
  });
};

const normalise = (err) => {
  if (err instanceof AppError) return err;

  if (err instanceof UniqueConstraintError) {
    return new AppError('A record with these values already exists', 409, 'CONFLICT',
      err.errors?.map((e) => ({ field: e.path, message: e.message })));
  }
  if (err instanceof ForeignKeyConstraintError) {
    return new AppError('Related record does not exist or is still in use', 409, 'FOREIGN_KEY_CONSTRAINT');
  }
  if (err instanceof SequelizeValidationError) {
    return new AppError('Validation failed', 422, 'VALIDATION_ERROR',
      err.errors?.map((e) => ({ field: e.path, message: e.message })));
  }
  if (err.type === 'entity.parse.failed') {
    return new AppError('Malformed JSON body', 400, 'BAD_REQUEST');
  }
  if (err.type === 'entity.too.large') {
    return new AppError('Request body too large', 413, 'PAYLOAD_TOO_LARGE');
  }
  return null;
};

// eslint-disable-next-line no-unused-vars
export const errorHandler = async (err, req, res, next) => {
  const known = normalise(err);
  const status = known?.statusCode ?? 500;

  // A signed-in user refused by a permission or role check (not the forced PIN change, which has its own code).
  // Awaited so the entry exists before the client sees the 403; recording never throws.
  if (status === 403 && known?.code === 'FORBIDDEN' && req.user) await recordAccessDenied(req);

  // Every 5xx is a bug or an outage, not an expected "business rule" failure (unlike 4xx) — worth
  // both a log line and an error-tracking report, correlated by requestId with what the client saw.
  if (status >= 500) {
    logger.error(`[${req.id}]`, err);
    captureException(err, {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      userId: req.user?.id,
    });
  }

  const body = {
    success: false,
    error: {
      code: known?.code ?? 'INTERNAL_ERROR',
      message: known?.message ?? 'Something went wrong',
    },
    requestId: req.id,
  };
  if (known?.details) body.error.details = known.details;
  if (!known && !env.isProduction) body.error.stack = err.stack;

  res.status(status).json(body);
};
