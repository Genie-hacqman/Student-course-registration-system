import * as Sentry from '@sentry/node';
import env from './env.js';
import { scrubEvent } from './sentry-scrub.js';

export { scrubEvent };

/**
 * Error tracking is optional everywhere, including production (see env.js): the app is fully
 * functional without it, you just lose proactive alerting when something breaks. Call this once,
 * as early as possible in server.js. A no-op when SENTRY_DSN isn't set.
 */
export const initSentry = () => {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    // Render sets this to the deployed commit, so every error is tied to the release that caused it.
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false, // no IP addresses, cookies or request bodies
    beforeSend: scrubEvent,
  });
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
