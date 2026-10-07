/**
 * "Have I seen this key recently?" with an expiry, in memory. Used to keep noisy audit signals (repeated 403s,
 * repeated views of the same record) down to one row per window.
 *
 * It is per process: a restart forgets everything and several instances do not share it. That is fine for
 * noise control, and the wrong tool for anything that must be counted exactly.
 */

const SWEEP_EVERY = 500;

export const createTtlSet = ({ max = 5000 } = {}) => {
  const seenUntil = new Map();
  let writes = 0;

  const sweep = (now) => {
    for (const [key, until] of seenUntil) if (until <= now) seenUntil.delete(key);
    // Still too many live keys (a burst of distinct ones): drop the oldest, which Map keeps first.
    while (seenUntil.size > max) seenUntil.delete(seenUntil.keys().next().value);
  };

  return {
    /** True if `key` was recorded within the last `ttlMs`; otherwise records it and returns false. */
    seen(key, ttlMs, now = Date.now()) {
      const until = seenUntil.get(key);
      if (until !== undefined && until > now) return true;
      seenUntil.delete(key); // re-insert so insertion order follows recency
      seenUntil.set(key, now + ttlMs);
      writes += 1;
      if (seenUntil.size > max || writes % SWEEP_EVERY === 0) sweep(now);
      return false;
    },
    clear() { seenUntil.clear(); },
    get size() { return seenUntil.size; },
  };
};

const shared = createTtlSet();

/** The process-wide set. Tests call `resetSeen()` between cases. */
export const seenRecently = (key, ttlMs) => shared.seen(key, ttlMs);
export const resetSeen = () => shared.clear();
