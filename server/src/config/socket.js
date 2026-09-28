let io = null;

export const setIO = (instance) => {
  io = instance;
};

/** Returns the Socket.IO server, or null when not attached (e.g. in tests using only supertest). */
export const getIO = () => io;
