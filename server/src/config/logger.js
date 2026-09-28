import pino from 'pino';
import env from './env.js';

/**
 * Turns this module's `(message, extra?)` call shape into pino's `(mergingObject?, message)`.
 * A pure function so it's unit-testable without touching pino's actual output stream.
 * - `extra` is an Error: pino gets `{ err: extra }` so it uses its built-in error serializer
 *   (stack trace, cause, etc.) instead of the error printing as "[object Error]".
 * - `extra` is anything else: stringified and appended to the message.
 */
export const normalizeLogArgs = (args) => {
  const [message, ...rest] = args;
  if (rest.length === 0) return [message];

  const errorArg = rest.find((a) => a instanceof Error);
  const otherParts = rest
    .filter((a) => a !== errorArg)
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));
  const fullMessage = [message, ...otherParts].join(' ');

  return errorArg ? [{ err: errorArg }, fullMessage] : [fullMessage];
};

// Pretty-printed, colorized output locally; plain JSON lines everywhere else (production and test),
// which is what a real log aggregator (CloudWatch, Datadog, ...) expects to parse.
const usePrettyPrint = env.NODE_ENV === 'development';

/** The underlying pino instance — used directly by pino-http in app.js so HTTP request logs share the same output/format/level. */
export const pinoInstance = pino({
  level: env.logLevel,
  ...(usePrettyPrint
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
    : {}),
});

const logger = {
  error: (...args) => pinoInstance.error(...normalizeLogArgs(args)),
  warn: (...args) => pinoInstance.warn(...normalizeLogArgs(args)),
  info: (...args) => pinoInstance.info(...normalizeLogArgs(args)),
  debug: (...args) => pinoInstance.debug(...normalizeLogArgs(args)),
};

export default logger;
