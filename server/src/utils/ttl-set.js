const SWEEP_EVERY = 500;

export const createTtlSet = ({ max = 5000 } = {}) => {
  const seenUntil = new Map();
  let writes = 0;

  const sweep = (now) => {
    for (const [key, until] of seenUntil) if (until <= now) seenUntil.delete(key);
    while (seenUntil.size > max) seenUntil.delete(seenUntil.keys().next().value);
  };

  return {
    seen(key, ttlMs, now = Date.now()) {
      const until = seenUntil.get(key);
      if (until !== undefined && until > now) return true;
      seenUntil.delete(key);
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

export const seenRecently = (key, ttlMs) => shared.seen(key, ttlMs);
export const resetSeen = () => shared.clear();
