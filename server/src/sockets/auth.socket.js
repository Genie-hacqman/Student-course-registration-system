import { getIO } from '../config/socket.js';
import { userRoom } from './registration.socket.js';

/** Each socket also joins a room for the access token it connected with, so one session can be cut off. */
export const tokenRoom = (jti) => `token:${jti}`;

export const disconnectUser = (userId) => {
  getIO()?.in(userRoom(userId)).disconnectSockets(true);
};

export const disconnectToken = (jti) => {
  getIO()?.in(tokenRoom(jti)).disconnectSockets(true);
};
