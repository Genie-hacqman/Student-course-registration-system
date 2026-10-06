import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets, safeLoginIdentifier, REDACTED } from '../../src/utils/redact.js';
import {
  GENESIS_HASH, STREAMS, canonicalize, computeRowHmac, computeSealHash, streamOf, verifyStream,
} from '../../src/utils/audit-integrity.js';

const SECRET = 's'.repeat(32);

describe('redactSecrets', () => {
  test('replaces secret-named values at any depth, including inside arrays', () => {
    const out = redactSecrets({
      name: 'CS101', password: 'hunter2', nested: { newPin: '123456', ok: 1, list: [{ refreshToken: 'x', keep: 'y' }] },
      activationHash: 'abc', verificationCode: 'ZZ-99', credentials: { pin: '1' },
    });
    assert.deepEqual(out, {
      name: 'CS101', password: REDACTED, nested: { newPin: REDACTED, ok: 1, list: [{ refreshToken: REDACTED, keep: 'y' }] },
      activationHash: REDACTED, verificationCode: REDACTED, credentials: REDACTED,
    });
  });

  test('keeps legitimate codes: course, department and programme codes are what an audit row should record', () => {
    const data = { code: 'CS101', courseCode: 'CS101', departmentCode: 'CSC', qualificationCode: 'BSC', shipping: 'x' };
    assert.deepEqual(redactSecrets(data), data);
  });

  test('does not mutate its input', () => {
    const input = { password: 'p', a: { token: 't' } };
    redactSecrets(input);
    assert.deepEqual(input, { password: 'p', a: { token: 't' } });
  });
});

describe('safeLoginIdentifier', () => {
  test('keeps an email or a Student ID', () => {
    assert.equal(safeLoginIdentifier('ama@school.edu'), 'ama@school.edu');
    assert.equal(safeLoginIdentifier('  STU202600123 '), 'STU202600123');
  });

  test('drops anything else: a password or PIN typed into the identifier field is never stored', () => {
    assert.equal(safeLoginIdentifier('Hunter2!'), REDACTED);
    assert.equal(safeLoginIdentifier('482915'), REDACTED);
    assert.equal(safeLoginIdentifier(undefined), REDACTED);
    assert.equal(safeLoginIdentifier('two words@x'), REDACTED);
  });
});

describe('canonicalize', () => {
  test('is independent of key order (MySQL reorders JSON keys)', () => {
    assert.equal(canonicalize({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } }), canonicalize({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }));
  });
});

const row = (overrides = {}) => ({
  id: 1,
  action: 'course.create',
  entityType: 'Course',
  entityId: 7,
  metadata: { code: 'CS101' },
  ipAddress: '10.0.0.1',
  requestId: 'req-1',
  userAgent: 'jest',
  actorEmail: 'admin@school.edu',
  actorRole: 'ADMIN',
  createdAt: new Date('2026-10-01T10:00:00.000Z'),
  ...overrides,
});
const signed = (overrides) => { const r = row(overrides); return { ...r, rowHmac: computeRowHmac(SECRET, r) }; };

describe('computeRowHmac', () => {
  test('changes when any recorded field changes, and with the key', () => {
    const base = computeRowHmac(SECRET, row());
    for (const change of [{ action: 'course.delete' }, { metadata: { code: 'CS102' } }, { ipAddress: '10.0.0.2' }, { actorEmail: 'x@y.z' }, { createdAt: new Date('2026-10-01T10:00:01.000Z') }]) {
      assert.notEqual(computeRowHmac(SECRET, row(change)), base, JSON.stringify(change));
    }
    assert.notEqual(computeRowHmac('t'.repeat(32), row()), base);
  });

  test('ignores user_id, which the foreign key clears when a user is deleted', () => {
    assert.equal(computeRowHmac(SECRET, row({ userId: 5 })), computeRowHmac(SECRET, row({ userId: null })));
  });

  test('is stable across a JSON round trip of metadata', () => {
    assert.equal(computeRowHmac(SECRET, row({ metadata: { b: 2, a: [1, { y: 1, x: 2 }] } })), computeRowHmac(SECRET, row({ metadata: JSON.parse('{"a":[1,{"x":2,"y":1}],"b":2}') })));
  });
});

describe('streamOf', () => {
  test('puts sign-in events in their own stream', () => {
    assert.equal(streamOf('auth.login'), STREAMS.SIGN_IN);
    assert.equal(streamOf('auth.login_failed'), STREAMS.SIGN_IN);
    assert.equal(streamOf('course.create'), STREAMS.MAIN);
    assert.equal(streamOf('auth.logout'), STREAMS.MAIN);
  });
});

// Builds a chain of seals over the given batches of rows, the way sealNextBatch does.
const chain = (batches) => {
  let prev = GENESIS_HASH;
  return batches.map((rows, i) => {
    const seal = {
      id: i + 1, fromId: rows[0].id, toId: rows[rows.length - 1].id, rowCount: rows.length, prevSealHash: prev, purgedAt: null,
    };
    seal.sealHash = computeSealHash({ stream: STREAMS.MAIN, prevSealHash: prev, fromId: seal.fromId, toId: seal.toId, rowHmacs: rows.map((r) => r.rowHmac) });
    prev = seal.sealHash;
    return seal;
  });
};

describe('verifyStream', () => {
  const rows = [1, 2, 3, 4].map((id) => signed({ id, entityId: id }));
  const batches = [rows.slice(0, 2), rows.slice(2)];
  const run = (seals, data = rows) => verifyStream({
    secret: SECRET, stream: STREAMS.MAIN, seals, rowsFor: (s) => data.filter((r) => r.id >= s.fromId && r.id <= s.toId),
  });

  test('an untouched chain has no problems', () => {
    assert.deepEqual(run(chain(batches)), []);
  });

  test('detects an edited row', () => {
    const edited = rows.map((r) => (r.id === 2 ? { ...r, metadata: { code: 'FORGED' } } : r));
    const problems = run(chain(batches), edited);
    assert.ok(problems.some((p) => p.type === 'row_modified' && p.rowId === 2));
  });

  test('detects a deleted row', () => {
    const problems = run(chain(batches), rows.filter((r) => r.id !== 3));
    assert.ok(problems.some((p) => p.type === 'row_count' && p.sealId === 2));
    assert.ok(problems.some((p) => p.type === 'seal_mismatch' && p.sealId === 2));
  });

  test('detects a row inserted into a sealed range, signed or not', () => {
    const extra = { ...row({ id: 2, action: 'forged' }), rowHmac: null };
    const problems = run(chain(batches), [...rows, extra].sort((a, b) => a.id - b.id));
    assert.ok(problems.some((p) => p.type === 'row_count'));
  });

  test('detects a removed first seal (truncated chain)', () => {
    const [, second] = chain(batches);
    assert.ok(run([second]).some((p) => p.type === 'chain_broken'));
  });

  test('detects a rewritten seal in the middle of the chain', () => {
    const [first, second] = chain(batches);
    assert.ok(run([{ ...first, sealHash: 'f'.repeat(64) }, second]).some((p) => p.type === 'chain_broken' || p.type === 'seal_mismatch'));
  });

  test('a purged seal is not re-checked against rows, but still anchors the chain', () => {
    const seals = chain(batches);
    seals[0] = { ...seals[0], purgedAt: new Date() };
    assert.deepEqual(run(seals, rows.slice(2)), []);
  });
});
