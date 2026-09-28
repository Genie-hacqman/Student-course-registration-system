import { getIO } from '../config/socket.js';
import { SOCKET_EVENTS } from '../utils/constants.js';

export const sectionRoom = (sectionId) => `section:${sectionId}`;
export const userRoom = (userId) => `user:${userId}`;
export const ADMIN_ROOM = 'admin:dashboard';

export const emitCapacityUpdated = (section) => {
  getIO()?.to(sectionRoom(section.id)).to(ADMIN_ROOM).emit(SOCKET_EVENTS.COURSE_CAPACITY_UPDATED, {
    sectionId: section.id,
    courseId: section.courseId,
    capacity: section.capacity,
    seatsTaken: section.seatsTaken,
    seatsAvailable: Math.max(section.capacity - section.seatsTaken, 0),
  });
};

export const emitRegistrationCreated = (userId, payload) => {
  getIO()?.to(userRoom(userId)).to(ADMIN_ROOM).emit(SOCKET_EVENTS.REGISTRATION_CREATED, payload);
};

export const emitRegistrationStatusChanged = (userId, payload) => {
  getIO()?.to(userRoom(userId)).to(ADMIN_ROOM).emit(SOCKET_EVENTS.REGISTRATION_STATUS_CHANGED, payload);
};

export const emitTimetableUpdated = (userId, payload) => {
  getIO()?.to(userRoom(userId)).emit(SOCKET_EVENTS.TIMETABLE_UPDATED, payload);
};

export const emitWaitlistSeatAvailable = (userId, payload) => {
  getIO()?.to(userRoom(userId)).emit(SOCKET_EVENTS.WAITLIST_SEAT_AVAILABLE, payload);
};
