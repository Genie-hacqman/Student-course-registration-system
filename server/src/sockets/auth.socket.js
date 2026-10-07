import { getIO } from '../config/socket.js';
import { userRoom } from './registration.socket.js';

export const tokenRoom = (jti) => `token:${jti}`;

export const disconnectUser = (userId) => {
  getIO()?.in(userRoom(userId)).disconnectSockets(true);
};

export const disconnectToken = (jti) => {
  getIO()?.in(tokenRoom(jti)).disconnectSockets(true);
};
