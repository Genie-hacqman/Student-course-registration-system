import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import cookieParser from 'cookie-parser';
import env from './src/config/env.js';
import { pinoInstance } from './src/config/logger.js';
import routes from './src/routes/index.js';
import webhookRoutes from './src/routes/webhook.routes.js';
import { requestId } from './src/middleware/request-id.middleware.js';
import { requestContext } from './src/middleware/request-context.middleware.js';
import { apiLimiter } from './src/middleware/rate-limit.middleware.js';
import { errorHandler, notFoundHandler } from './src/middleware/error.middleware.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(requestId);
app.use(helmet());
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use('/api/webhooks', express.raw({ type: 'application/json', limit: '256kb' }), webhookRoutes);
app.use(['/api/admin/import', '/api/results/import', '/api/admissions/bulk'], express.json({ limit: '5mb' }));
app.use('/api/applications/me/photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }));
app.use('/api/auth/me/avatar', express.json({ limit: '400kb' }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
if (!env.isTest) {
  app.use(pinoHttp({
    logger: pinoInstance,
    genReqId: (req) => req.id,
    customProps: (req) => ({ requestId: req.id }),
    autoLogging: { ignore: (req) => req.originalUrl === '/api/health' },
    customLogLevel: (req, res, err) => {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }));
}

app.use(requestContext);
app.use('/api', apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
