/** "HH:MM[:SS]" → minutes since midnight. */
export const toMinutes = (time) => {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Two time slots overlap when they share a day and each starts before the other ends.
 * Touching slots (08:00–10:00 and 10:00–12:00) do NOT overlap.
 */
export const slotsOverlap = (a, b) =>
  a.day === b.day && toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
