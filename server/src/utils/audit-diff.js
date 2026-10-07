/**
 * Before/after summaries for audit entries.
 *
 * `instance.update(data)` overwrites the values the instance was loaded with, so the "before" side has to be
 * copied out *before* the write. Typical use:
 *
 *   const before = snapshot(record, Object.keys(data));
 *   await record.update(data, { transaction });
 *   await audit.log({ ..., metadata: { code: record.code, ...diffFields(before, snapshot(record, Object.keys(data)), { omitValues: ['description'] }) } });
 */

// Lists and long values are summarised, never stored whole: the log is not a second copy of the data.
const MAX_VALUE_LENGTH = 200;

/** Plain copy of just the given fields (Dates become ISO strings so they compare and serialise the same way). */
export const snapshot = (record, keys) => {
  const source = typeof record?.get === 'function' ? record.get({ plain: true }) : (record ?? {});
  return Object.fromEntries(keys.filter((k) => k in source).map((k) => [k, normalise(source[k])]));
};

const normalise = (value) => (value instanceof Date ? value.toISOString() : value === undefined ? null : value);

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const clipValue = (value) => (typeof value === 'string' && value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value);

/**
 * `{ changes: { field: { from, to } } }` for the fields that really changed, or `{}` when none did.
 * Fields in `omitValues` (long text, personal data) are reported as `{ changed: true }` without their values.
 */
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

/**
 * `{ changed, entries, truncated? }` for a list of per-row changes: the true count, but only the first `max`
 * entries, so a 1000-row save cannot bloat the log.
 */
export const summariseEntries = (list, max = 50) => ({
  changed: list.length,
  entries: list.slice(0, max),
  ...(list.length > max ? { truncated: true } : {}),
});
