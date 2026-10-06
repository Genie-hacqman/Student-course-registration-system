import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/**
 * Makes the current Express request reachable from deep inside services, so `audit.log` can record the
 * IP, user agent, request id and actor without every caller passing `req`.
 *
 * Mount it AFTER the body parsers: stream-based parsers resume their callbacks outside the async context
 * that was active when they were registered, which would lose the store. Everything after it
 * (authenticate, controllers, services) runs inside the context, across awaits.
 */
export const requestContext = (req, res, next) => storage.run({ req }, next);

/** The Express request of the current HTTP call, or undefined outside one (scripts, timers). */
export const currentRequest = () => storage.getStore()?.req;
