/**
 * `npm run sentry:test` — sends one clearly labelled test error to Sentry and waits for it to be delivered, so you
 * can confirm SENTRY_DSN works before relying on it. Changes nothing in the app or the database.
 *
 *   SENTRY_DSN=https://...ingest.sentry.io/... npm run sentry:test
 */
import * as Sentry from '@sentry/node';
import { scrubEvent } from '../src/config/sentry-scrub.js';

const dsn = process.env.SENTRY_DSN;
if (!dsn) {
  console.error('SENTRY_DSN is not set. Copy the DSN from Sentry (Project settings → Client Keys) and run:\n  SENTRY_DSN=<your dsn> npm run sentry:test');
  process.exit(1);
}

Sentry.init({ dsn, environment: process.env.NODE_ENV || 'development', sendDefaultPii: false, beforeSend: scrubEvent });
const eventId = Sentry.captureException(new Error('UniReg Sentry test: if you can read this in Sentry, error tracking works'), {
  tags: { test: 'sentry:test' },
});
const delivered = await Sentry.flush(10_000);
if (delivered) {
  console.log(`Sent a test error to Sentry (event id ${eventId}). It should appear under Issues within a minute.`);
} else {
  console.error('Could not deliver the test error within 10 seconds. Check the DSN and your network connection.');
  process.exitCode = 1;
}
