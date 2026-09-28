import { getIO } from '../config/socket.js';
import { SOCKET_EVENTS } from '../utils/constants.js';
import { userRoom } from './registration.socket.js';

export const emitNotification = (notification) => {
  getIO()?.to(userRoom(notification.userId)).emit(SOCKET_EVENTS.NOTIFICATION_CREATED, {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    data: notification.data,
    createdAt: notification.createdAt,
  });
};
