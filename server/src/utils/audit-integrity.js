import crypto from 'node:crypto';

/**
 * Pure integrity helpers for the audit log (no database, no config), so they can be unit tested.
 *
 * Each row carries an HMAC over its content; a scheduled job then seals batches of rows into a hash
 * chain (audit_seals). An edited row fails its HMAC, a deleted or inserted row breaks its seal, and a
 * removed seal breaks the chain. `user_id` is left out of the row HMAC on purpose: the foreign key
 * clears it (ON DELETE SET NULL) when a user is deleted, and that must not look like tampering. The
 * actor's email and role snapshot, which are covered, keep the attribution.
 */

// Sign-in noise is kept for a shorter time than everything else, so each kind gets its own chain.
export const SIGN_IN_ACTIONS = Object.freeze(['auth.login', 'auth.login_failed', 'auth.login_locked']);
export const STREAMS = Object.freeze({ MAIN: 'main', SIGN_IN: 'signin' });
export const streamOf = (action) => (SIGN_IN_ACTIONS.includes(action) ? STREAMS.SIGN_IN : STREAMS.MAIN);

export const GENESIS_HASH = '0'.repeat(64);

/** JSON with object keys sorted at every depth, so MySQL's JSON key reordering cannot change the hash. */
export const canonicalize = (value) => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
};

const iso = (d) => (d instanceof Date ? d : new Date(d)).toISOString();

export const hmac = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

/** The HMAC stored in `audit_logs.row_hmac`. `row` is a model instance or a plain row (camelCase fields). */
export const computeRowHmac = (secret, row) => hmac(secret, canonicalize({
  action: row.action,
  entityType: row.entityType ?? null,
  entityId: row.entityId ?? null,
  metadata: row.metadata ?? null,
  ipAddress: row.ipAddress ?? null,
  requestId: row.requestId ?? null,
  userAgent: row.userAgent ?? null,
  actorEmail: row.actorEmail ?? null,
  actorRole: row.actorRole ?? null,
  createdAt: iso(row.createdAt),
}));

/** `rows` are in id order; `rowHmacs` is each row's stored HMAC in that same order. */
export const computeSealHash = ({ stream, prevSealHash, fromId, toId, rowHmacs }) =>
  sha256([stream, prevSealHash, fromId, toId, rowHmacs.length, ...rowHmacs].join('|'));

export const timingSafeEqualHex = (a, b) => {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/**
 * Checks one stream's seals against the rows currently in the table.
 *  - `seals`: the stream's seals in id order, each { id, fromId, toId, rowCount, prevSealHash, sealHash, purgedAt }
 *  - `rowsFor(seal)`: the stream's rows with id in [fromId, toId], in id order (not called for purged seals)
 * Returns the list of problems found (empty when the stream is intact).
 */
export const verifyStream = ({ secret, stream, seals, rowsFor }) => {
  const problems = [];
  let prev = GENESIS_HASH;
  for (const seal of seals) {
    if (!timingSafeEqualHex(seal.prevSealHash, prev)) {
      problems.push({ type: 'chain_broken', stream, sealId: seal.id, message: `Seal #${seal.id} does not follow the previous seal (a seal was removed or changed).` });
    }
    if (!seal.purgedAt) {
      const rows = rowsFor(seal);
      if (rows.length !== seal.rowCount) {
        problems.push({ type: 'row_count', stream, sealId: seal.id, message: `Seal #${seal.id} covers ${seal.rowCount} rows (ids ${seal.fromId}-${seal.toId}) but ${rows.length} exist: rows were deleted or inserted.` });
      }
      for (const row of rows) {
        if (!row.rowHmac) {
          problems.push({ type: 'unsigned_row', stream, sealId: seal.id, rowId: row.id, message: `Row #${row.id} inside seal #${seal.id} has no signature.` });
        } else if (!timingSafeEqualHex(row.rowHmac, computeRowHmac(secret, row))) {
          problems.push({ type: 'row_modified', stream, sealId: seal.id, rowId: row.id, message: `Row #${row.id} was modified after it was written.` });
        }
      }
      const expected = computeSealHash({
        stream, prevSealHash: seal.prevSealHash, fromId: seal.fromId, toId: seal.toId, rowHmacs: rows.map((r) => r.rowHmac),
      });
      if (!timingSafeEqualHex(expected, seal.sealHash)) {
        problems.push({ type: 'seal_mismatch', stream, sealId: seal.id, message: `Seal #${seal.id} no longer matches its rows.` });
      }
    }
    prev = seal.sealHash;
  }
  return problems;
};
