import * as Sentry from '@sentry/node';
import env from './env.js';
import { scrubEvent } from './sentry-scrub.js';

export { scrubEvent };

export const initSentry = () => {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.RENDER_GIT_COMMIT || undefined,
    sendDefaultPii: false,
    beforeSend: scrubEvent,
  });
};

export const captureException = (err, context) => {
  if (!env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
};
