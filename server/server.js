import http from 'node:http';
import app from './app.js';
import env from './src/config/env.js';
import logger from './src/config/logger.js';
import { initSentry, captureException } from './src/config/sentry.js';
import { sequelize } from './src/models/index.js';
import { initSocketServer } from './src/sockets/socket.server.js';
import { purgeExpiredTokens } from './src/services/session.service.js';
import * as permissionService from './src/services/permission.service.js';

initSentry();

const TOKEN_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const cleanupTokens = async () => {
  try {
    const removed = await purgeExpiredTokens();
    logger.debug(`Token cleanup: removed ${removed.revokedAccessTokens} revoked access tokens, ${removed.refreshTokens} refresh tokens`);
  } catch (err) {
    logger.error('Token cleanup failed:', err.message);
  }
};

const start = async () => {
  try {
    await sequelize.authenticate();
    logger.info(`Connected to MySQL database "${env.dbName}"`);
  } catch (err) {
    logger.error('Unable to connect to the database:', err.message);
    process.exit(1);
  }

  try {
    await permissionService.reload();
  } catch (err) {
    // Most likely migrations haven't been run yet; the code defaults still apply.
    logger.warn('Could not load role permission overrides, using defaults:', err.message);
  }

  const server = http.createServer(app);
  const io = initSocketServer(server);

  cleanupTokens();
  const cleanupTimer = setInterval(cleanupTokens, TOKEN_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
  const permissionTimer = permissionService.startPeriodicReload();

  server.listen(env.PORT, () => {
    logger.info(`SCRS API listening on http://localhost:${env.PORT}/api (${env.NODE_ENV})`);
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    clearInterval(cleanupTimer);
    clearInterval(permissionTimer);
    io.close();
    server.close(async () => {
      await sequelize.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // A rejected promise nobody awaited — logged and reported, but not fatal: Node's own default
  // here is non-fatal too, and every fire-and-forget call in this codebase (notification/email
  // sending) already catches its own errors internally, so this is a safety net, not the norm.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection:', reason);
    captureException(reason instanceof Error ? reason : new Error(String(reason)));
  });

  // A genuinely unexpected synchronous throw escaped everything. The process may be in a broken
  // state at this point — Node's own guidance is to report and exit, not to keep running, and let
  // the process manager (systemd, Docker, the host's own restart policy) bring up a fresh one.
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception, shutting down:', err);
    captureException(err);
    process.exit(1);
  });
};

start();
