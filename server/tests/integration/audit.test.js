import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { resetDatabase, api, loginAs, auth, query, sequelize, sectionIdFor } from './helpers.js';
import { AuditLog, AuditSeal, User } from '../../src/models/index.js';
import * as audit from '../../src/services/audit.service.js';
import * as maintenance from '../../src/services/audit-maintenance.service.js';
import * as storage from '../../src/services/storage.service.js';

let admin;
let registrar;
let student;

const rowsFor = (action) => query('SELECT * FROM audit_logs WHERE action = :action ORDER BY id', { action });
const later = (ms) => new Date(Date.now() + ms);
const MINUTES = 60 * 1000;
const DAYS = 24 * 60 * MINUTES;

before(async () => {
  resetDatabase();
  [admin, registrar, student] = await Promise.all(['admin', 'registrar', 'student'].map((who) => loginAs(who)));
});
after(() => sequelize.close());

describe('recording', () => {
  test('a service that never passes req still gets IP, browser, request id and the actor snapshot', async () => {
    const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'MATH'");
    const res = await api().post('/api/courses').set(auth(registrar.token)).set('User-Agent', 'audit-test/1.0')
      .send({ departmentId, code: 'AUD101', title: 'Auditing', credits: 3, level: 100 });
    assert.equal(res.status, 201);

    const [row] = await query("SELECT * FROM audit_logs WHERE action = 'course.create' AND entity_id = :id", { id: res.body.data.id });
    assert.ok(row.ip_address, 'IP recorded');
    assert.equal(row.user_agent, 'audit-test/1.0');
    assert.equal(row.request_id, res.headers['x-request-id']);
    assert.equal(row.actor_email, 'registrar@scrs.local');
    assert.equal(row.actor_role, 'REGISTRAR');
    assert.match(row.row_hmac, /^[0-9a-f]{64}$/);
  });

  test('the request id is minted by the server; a caller cannot choose it', async () => {
    const res = await api().get('/api/auth/me').set(auth(student.token)).set('x-request-id', 'chosen-by-caller');
    assert.notEqual(res.headers['x-request-id'], 'chosen-by-caller');
    const failed = await api().post('/api/auth/login').set('x-request-id', 'chosen-by-caller').send({ identifier: 'nobody@scrs.local', password: 'Wrong@12345' });
    assert.equal(failed.status, 401);
    assert.equal((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id = 'chosen-by-caller'"))[0].n, 0);
  });

  test('metadata is redacted: secret-named keys never reach the table, codes do', async () => {
    await audit.log({ action: 'test.redaction', metadata: { password: 'hunter2', nested: { newPin: '123456' }, code: 'CS101' } });
    const [row] = await rowsFor('test.redaction');
    assert.deepEqual(row.metadata, { password: '[redacted]', nested: { newPin: '[redacted]' }, code: 'CS101' });
  });

  test('a failed sign-in keeps a typed email or Student ID but never a typed secret', async () => {
    const attempt = (identifier) => api().post('/api/auth/login').send({ identifier, password: 'Wrong@12345' });
    await attempt('Hunter2!pass');
    await attempt('482915');
    await attempt('someone@scrs.local');
    const stored = (await rowsFor('auth.login_failed')).map((r) => r.metadata.email);
    assert.ok(!stored.includes('Hunter2!pass') && !stored.includes('482915'));
    assert.ok(stored.includes('[redacted]'));
    assert.ok(stored.includes('someone@scrs.local'));
  });

  test('a successful sign-in records the actor snapshot even though no one was authenticated yet', async () => {
    const [row] = (await rowsFor('auth.login')).slice(-1);
    assert.ok(row.actor_email);
    assert.ok(row.actor_role);
  });

  test('printing a slip does not store its verification code', async () => {
    await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor('CS201') });
    const added = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor('CS203') });
    const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const pdf = await api().get(`/api/registrations/${added.body.data.registration.id}/slip`).set(auth(student.token)).buffer(true)
      .parse((res, cb) => { const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    assert.equal(pdf.status, 200);
    const [row] = await rowsFor('registration.slip_printed');
    assert.ok(row.metadata.referenceNumber);
    assert.equal(row.metadata.verificationCode, undefined);
  });

  test('the actor snapshot survives the account being deleted', async () => {
    const created = await User.findOne({ where: { email: 'student@scrs.local' } });
    await audit.log({ userId: created.id, action: 'test.snapshot', actor: { email: created.email, role: 'STUDENT' } });
    await query('UPDATE audit_logs SET user_id = NULL WHERE action = :a', { a: 'test.snapshot' });
    const [row] = await rowsFor('test.snapshot');
    assert.equal(row.user_id, null);
    assert.equal(row.actor_email, 'student@scrs.local');
  });
});

describe('failure handling', () => {
  test('without a transaction a failed write is swallowed (never fails the business action)', async () => {
    await assert.doesNotReject(audit.log({ action: null }));
  });

  test('inside a transaction a failed write throws and the change it described is rolled back', async () => {
    const before = (await query("SELECT COUNT(*) AS n FROM settings WHERE `key` = 'audit.test'"))[0].n;
    await assert.rejects(sequelize.transaction(async (transaction) => {
      await sequelize.query("INSERT INTO settings (`key`, value, created_at, updated_at) VALUES ('audit.test', '1', NOW(), NOW())", { transaction });
      await audit.log({ action: null, transaction });
    }));
    assert.equal((await query("SELECT COUNT(*) AS n FROM settings WHERE `key` = 'audit.test'"))[0].n, before);
  });
});

describe('append-only', () => {
  test('the model refuses updates and deletes', async () => {
    const row = await AuditLog.findOne({ where: { action: 'course.create' } });
    row.metadata = { code: 'FORGED' };
    await assert.rejects(row.save(), /append-only/);
    await assert.rejects(row.destroy(), /append-only/);
    await assert.rejects(AuditLog.update({ action: 'x' }, { where: {} }), /append-only/);
    await assert.rejects(AuditLog.destroy({ where: {} }), /append-only/);
  });

  test('audit:view cannot be delegated to another role', async () => {
    const roles = (await api().get('/api/admin/roles').set(auth(admin.token))).body.data;
    const registrarRole = roles.find((r) => r.name === 'REGISTRAR');
    const res = await api().put(`/api/admin/roles/${registrarRole.id}/permissions`).set(auth(admin.token))
      .send({ permissions: [...registrarRole.permissions, 'audit:view'] });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /audit:view/);
  });
});

describe('querying', () => {
  const get = (path) => api().get(`/api/admin/audit-logs${path}`).set(auth(admin.token));

  test('pages never repeat or skip rows, even when many share a second', async () => {
    for (let i = 0; i < 6; i += 1) await audit.log({ action: 'test.paging', entityType: 'Probe', entityId: 900 + i });
    const seen = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await get(`?action=test.paging&limit=2&page=${page}`);
      seen.push(...res.body.data.map((r) => r.id));
    }
    assert.equal(seen.length, 6);
    assert.equal(new Set(seen).size, 6, 'no duplicates');
    assert.deepEqual(seen, [...seen].sort((a, b) => b - a), 'strictly newest first');
  });

  test('filters: action prefix, entity id, request id and date range; the signature is never returned', async () => {
    const prefix = await get('?actionPrefix=test.');
    assert.ok(prefix.body.data.length >= 6);
    assert.ok(prefix.body.data.every((r) => r.action.startsWith('test.')));
    assert.equal(prefix.body.data[0].rowHmac, undefined);

    const byEntity = await get('?entityType=Probe&entityId=903');
    assert.equal(byEntity.body.data.length, 1);

    const [course] = await rowsFor('course.create');
    assert.equal((await get(`?requestId=${course.request_id}`)).body.data.length, 1);

    const future = new Date(Date.now() + DAYS).toISOString();
    assert.equal((await get(`?from=${encodeURIComponent(future)}`)).body.data.length, 0);
    assert.ok((await get(`?to=${encodeURIComponent(future)}&limit=1`)).body.data.length === 1);
  });

  test('a prefix with LIKE wildcards matches literally', async () => {
    assert.equal((await get('?actionPrefix=%25')).body.data.length, 0);
  });

  test('the filter options list the record types actually present', async () => {
    const res = await api().get('/api/admin/audit-logs/options').set(auth(admin.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.entityTypes.includes('Course'));
    assert.ok(res.body.data.entityTypes.includes('Probe'));
    assert.ok(res.body.data.actions.some((a) => a.action === 'course.create' && a.label === 'Course created'));
    assert.equal((await api().get('/api/admin/audit-logs/options').set(auth(registrar.token))).status, 403);
  });
});

describe('seals, verification and tampering', () => {
  test('rows are sealed once old enough, and verification passes', async () => {
    assert.equal(await maintenance.sealPending(), 0, 'fresh rows are not sealed yet');
    assert.ok((await maintenance.sealPending({ now: later(10 * MINUTES) })) >= 2, 'main and sign-in streams');
    const result = await maintenance.verify();
    assert.deepEqual(result.problems, []);
    assert.ok(result.ok);
    const streams = (await AuditSeal.findAll({ raw: true })).map((s) => s.stream);
    assert.ok(streams.includes('main') && streams.includes('signin'));
    assert.equal(await maintenance.sealPending({ now: later(10 * MINUTES) }), 0, 'nothing is sealed twice');
  });

  test('an edited row is detected, sealed or not', async () => {
    const [row] = await rowsFor('course.create');
    await query("UPDATE audit_logs SET metadata = JSON_OBJECT('code', 'FORGED') WHERE id = :id", { id: row.id });
    const tampered = await maintenance.verify();
    assert.ok(tampered.problems.some((p) => p.type === 'row_modified' && p.rowId === row.id));

    await query('UPDATE audit_logs SET metadata = :m WHERE id = :id', { m: JSON.stringify(row.metadata), id: row.id });
    assert.ok((await maintenance.verify()).ok, 'restoring the original content clears it');

    await audit.log({ action: 'test.unsealed' });
    const [unsealed] = await rowsFor('test.unsealed');
    await query("UPDATE audit_logs SET action = 'test.edited' WHERE id = :id", { id: unsealed.id });
    assert.ok((await maintenance.verify()).problems.some((p) => p.rowId === unsealed.id), 'recent unsealed rows are signed too');
    await query("UPDATE audit_logs SET action = 'test.unsealed' WHERE id = :id", { id: unsealed.id });
  });

  test('a deleted row is detected', async () => {
    const [row] = await rowsFor('test.paging');
    const copy = { ...row };
    await query('DELETE FROM audit_logs WHERE id = :id', { id: row.id });
    const result = await maintenance.verify();
    assert.ok(result.problems.some((p) => p.type === 'row_count'));
    assert.ok(result.problems.some((p) => p.type === 'seal_mismatch'));

    await query(
      'INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, metadata, ip_address, request_id, user_agent, actor_email, actor_role, row_hmac, created_at) VALUES (:id, :user_id, :action, :entity_type, :entity_id, :metadata, :ip_address, :request_id, :user_agent, :actor_email, :actor_role, :row_hmac, :created_at)',
      { ...copy, metadata: copy.metadata === null ? null : JSON.stringify(copy.metadata) },
    );
    assert.ok((await maintenance.verify()).ok);
  });

  test('a removed seal breaks the chain', async () => {
    const seals = await AuditSeal.findAll({ where: { stream: 'main' }, order: [['id', 'ASC']] });
    await audit.log({ action: 'test.second_batch' });
    await maintenance.sealPending({ now: later(20 * MINUTES) });
    const all = await AuditSeal.findAll({ where: { stream: 'main' }, order: [['id', 'ASC']] });
    assert.ok(all.length > seals.length);
    const first = all[0].toJSON();
    await query('DELETE FROM audit_seals WHERE id = :id', { id: first.id });
    assert.ok((await maintenance.verify()).problems.some((p) => p.type === 'chain_broken'));
    await sequelize.query('INSERT INTO audit_seals (id, stream, from_id, to_id, row_count, last_row_at, prev_seal_hash, seal_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())', {
      replacements: [first.id, first.stream, first.fromId, first.toId, first.rowCount, first.lastRowAt, first.prevSealHash, first.sealHash],
    });
    assert.ok((await maintenance.verify()).ok);
  });
});

const memoryStorage = () => {
  const objects = new Map();
  return {
    name: 'memory',
    put: async (key, body) => { objects.set(key, Buffer.from(body)); },
    get: async (key) => objects.get(key) ?? null,
    remove: async (key) => { objects.delete(key); },
  };
};

describe('retention', () => {
  const archive = memoryStorage();
  before(() => storage.useDriverForTests(archive));
  after(() => storage.useDriverForTests(undefined));

  test('sign-ins are archived and purged after 12 months, everything else after 24; the chain still verifies', async () => {
    await maintenance.sealPending({ now: later(30 * MINUTES) });
    const SHORT = "(action LIKE 'auth.login%' OR action LIKE 'security.%')";
    const signInsBefore = (await query(`SELECT COUNT(*) AS n FROM audit_logs WHERE ${SHORT}`))[0].n;
    const othersBefore = (await query(`SELECT COUNT(*) AS n FROM audit_logs WHERE NOT ${SHORT}`))[0].n;
    assert.ok(signInsBefore > 0 && othersBefore > 0);

    const first = await maintenance.purgeExpired({ now: later(13 * 30 * DAYS) });
    assert.equal(first.purged, Number(signInsBefore));
    assert.equal((await query(`SELECT COUNT(*) AS n FROM audit_logs WHERE ${SHORT}`))[0].n, 0);
    assert.equal((await query(`SELECT COUNT(*) AS n FROM audit_logs WHERE NOT ${SHORT}`))[0].n, othersBefore);
    assert.ok((await maintenance.verify()).ok, 'purged seals still anchor the chain');

    const purged = await AuditSeal.findAll({ where: { stream: 'signin' } });
    assert.ok(purged.length > 0);
    let archived = 0;
    for (const seal of purged) {
      assert.ok(seal.purgedAt && seal.archiveKey);
      const lines = zlib.gunzipSync(await storage.get(seal.archiveKey)).toString().split('\n').filter(Boolean);
      assert.equal(lines.length, seal.rowCount);
      archived += lines.length;
    }
    assert.equal(archived, Number(signInsBefore));

    const second = await maintenance.purgeExpired({ now: later(3 * 365 * DAYS) });
    assert.equal(second.purged, Number(othersBefore));
    assert.equal((await query('SELECT COUNT(*) AS n FROM audit_logs WHERE row_hmac IS NOT NULL AND id <= (SELECT MAX(to_id) FROM audit_seals)'))[0].n, 0);
    assert.ok((await maintenance.verify()).ok);
  });

  test('nothing is deleted when the archive cannot be stored', async () => {
    await audit.log({ action: 'test.keep' });
    await maintenance.sealPending({ now: later(60 * MINUTES) });
    storage.useDriverForTests(null);
    try {
      assert.deepEqual(await maintenance.purgeExpired({ now: later(3 * 365 * DAYS) }), { purged: 0 });
    } finally {
      storage.useDriverForTests(archive);
    }
    assert.equal((await rowsFor('test.keep')).length, 1);
  });
});
