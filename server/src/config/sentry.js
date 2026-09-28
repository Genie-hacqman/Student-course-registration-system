import * as Sentry from '@sentry/node';
import env from './env.js';

/**
 * Error tracking is optional everywhere, including production (see env.js): the app is fully
 * functional without it, you just lose proactive alerting when something breaks. Call this once,
 * as early as possible in server.js. A no-op when SENTRY_DSN isn't set.
 */
export const initSentry = () => {
  if (!env.SENTRY_DSN) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
};

/**
 * Reports an unexpected error, with whatever request/user context is available, so it can be
 * correlated back to the requestId shown in the API's own error response and in the logs.
 * A no-op when SENTRY_DSN isn't set — safe to call unconditionally from anywhere.
 */
export const captureException = (err, context) => {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
};
