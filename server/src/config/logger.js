import pino from 'pino';
import env from './env.js';

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

const usePrettyPrint = env.NODE_ENV === 'development';

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
