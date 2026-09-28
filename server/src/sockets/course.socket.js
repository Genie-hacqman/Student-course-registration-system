import { z } from 'zod';
import { sectionRoom } from './registration.socket.js';

const sectionIds = z.array(z.coerce.number().int().positive()).max(50);

/**
 * Clients join section rooms while a course page or registration cart is open,
 * so capacity updates are only pushed to people who are looking at that section.
 */
export const registerCourseHandlers = (socket) => {
  const handle = (join) => (payload, ack) => {
    const parsed = sectionIds.safeParse(Array.isArray(payload) ? payload : [payload]);
    if (!parsed.success) {
      if (typeof ack === 'function') ack({ ok: false, error: 'Invalid section id' });
      return;
    }
    for (const id of parsed.data) {
      if (join) socket.join(sectionRoom(id));
      else socket.leave(sectionRoom(id));
    }
    if (typeof ack === 'function') ack({ ok: true, sections: parsed.data });
  };

  socket.on('section:join', handle(true));
  socket.on('section:leave', handle(false));
};
