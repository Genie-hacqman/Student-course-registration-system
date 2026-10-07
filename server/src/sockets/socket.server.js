import { Server } from 'socket.io';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { setIO } from '../config/socket.js';
import { ADMIN_ROLES, ROLES } from '../utils/constants.js';
import { resolveAccessToken } from '../middleware/auth.middleware.js';
import { registerCourseHandlers } from './course.socket.js';
import { userRoom, ADMIN_ROOM } from './registration.socket.js';
import { tokenRoom } from './auth.socket.js';

export const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token
        ?? socket.handshake.headers.authorization?.replace(/^Bearer /, '');
      if (!token) return next(new Error('UNAUTHORIZED'));

      const { user, payload } = await resolveAccessToken(token);
      if (user.mustChangePassword) return next(new Error('PIN_CHANGE_REQUIRED'));
      socket.data.user = { id: user.id, role: user.role.name };
      socket.data.jti = payload.jti;
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role } = socket.data.user;
    socket.join([userRoom(id), tokenRoom(socket.data.jti)]);
    if (ADMIN_ROLES.includes(role)) socket.join(ADMIN_ROOM);

    registerCourseHandlers(socket);

    logger.debug(`socket connected user=${id} role=${role}`);
    socket.on('disconnect', () => logger.debug(`socket disconnected user=${id}`));
  });

  setIO(io);
  return io;
};
