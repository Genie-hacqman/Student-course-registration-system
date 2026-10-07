const MAX_VALUE_LENGTH = 200;

export const snapshot = (record, keys) => {
  const source = typeof record?.get === 'function' ? record.get({ plain: true }) : (record ?? {});
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, normalise(source[k])]));
};

const normalise = (value) => (value instanceof Date ? value.toISOString() : value === undefined ? null : value);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const clipValue = (value) => (typeof value === 'string' && value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value);

export const diffFields = (before, after, { omitValues = [] } = {}) => {
  const changes = {};
  for (const key of Object.keys(after)) {
    if (same(before[key], after[key])) continue;
    changes[key] = omitValues.includes(key)
      ? { changed: true }
      : { from: clipValue(normalise(before[key] ?? null)), to: clipValue(normalise(after[key] ?? null)) };
  }
  return Object.keys(changes).length ? { changes } : {};
};

export const summariseEntries = (list, max = 50) => ({
  changed: list.length,
  entries: list.slice(0, max),
  ...(list.length > max ? { truncated: true } : {}),
});
