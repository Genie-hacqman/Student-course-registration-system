import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resetDatabase, api, loginAs, auth, query, sequelize } from './helpers.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../src/utils/constants.js';

let admin;
let registrar;
let student;

before(async () => {
  resetDatabase();
  [admin, registrar, student] = await Promise.all(['admin', 'registrar', 'student'].map((w) => loginAs(w)));
});
after(() => sequelize.close());

const as = (who) => auth(who.token);

describe('roles & permissions', () => {
  test('the super admin sees every role; others cannot', async () => {
    const roles = await api().get('/api/admin/roles').set(as(admin));
    assert.equal(roles.status, 200);
    const byName = Object.fromEntries(roles.body.data.map((r) => [r.name, r]));
    assert.equal(byName.REGISTRAR.editable, true);
    assert.equal(byName.SUPER_ADMIN.editable, false);
    assert.equal(byName.USER.editable, false);
    assert.deepEqual([...byName.REGISTRAR.permissions].sort(), [...ROLE_PERMISSIONS.REGISTRAR].sort());

    const catalog = await api().get('/api/admin/permissions').set(as(admin));
    assert.equal(catalog.body.data.length, Object.values(PERMISSIONS).length);
    assert.equal((await api().get('/api/admin/roles').set(as(registrar))).status, 403);
  });

  test('revoking a permission takes effect immediately, and resetting restores the defaults', async () => {
    const [{ id: roleId }] = await query("SELECT id FROM roles WHERE name = 'REGISTRAR'");
    const without = ROLE_PERMISSIONS.REGISTRAR.filter((p) => p !== PERMISSIONS.REPORT_VIEW);

    const saved = await api().put(`/api/admin/roles/${roleId}/permissions`).set(as(admin)).send({ permissions: without });
    assert.equal(saved.status, 200);
    assert.ok(!saved.body.data.permissions.includes(PERMISSIONS.REPORT_VIEW));
    assert.equal((await api().get('/api/admin/reports/registration-summary').set(as(registrar))).status, 403);
    const me = await api().get('/api/auth/me').set(as(registrar));
    assert.ok(!me.body.data.permissions.includes(PERMISSIONS.REPORT_VIEW), '/auth/me reflects the change');

    const [log] = await query("SELECT metadata FROM audit_logs WHERE action = 'role.permissions.update' ORDER BY id DESC LIMIT 1");
    const metadata = typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata;
    assert.deepEqual(metadata.removed, [PERMISSIONS.REPORT_VIEW]);

    await api().put(`/api/admin/roles/${roleId}/permissions`).set(as(admin)).send({ permissions: ROLE_PERMISSIONS.REGISTRAR });
    assert.equal((await query('SELECT COUNT(*) AS n FROM role_permission_overrides'))[0].n, 0, 'defaults store no overrides');
    assert.equal((await api().get('/api/admin/reports/registration-summary').set(as(registrar))).status, 200);
  });

  test('fixed roles and escalation are refused', async () => {
    const ids = Object.fromEntries((await query('SELECT id, name FROM roles')).map((r) => [r.name, r.id]));
    const put = (name, permissions) => api().put(`/api/admin/roles/${ids[name]}/permissions`).set(as(admin)).send({ permissions });
    assert.equal((await put('SUPER_ADMIN', [])).status, 403);
    assert.equal((await put('USER', [])).status, 403);
    assert.equal((await put('ADMIN', [...ROLE_PERMISSIONS.ADMIN, PERMISSIONS.ROLE_MANAGE])).status, 400);
    assert.equal((await put('ADMIN', ['not:a:permission'])).status, 422);
  });
});

describe('admin overview report', () => {
  test('real counts for dashboards; audit activity only for audit viewers', async () => {
    const res = await api().get('/api/admin/reports/overview').set(as(registrar));
    assert.equal(res.status, 200);
    const o = res.body.data;
    const [{ n: students }] = await query('SELECT COUNT(*) AS n FROM students');
    assert.equal(o.totals.students, students);
    assert.ok(o.users.byRole.some((r) => r.role === 'USER' && r.total >= 1));
    assert.ok(o.studentsByProgram.length >= 1);
    assert.equal(typeof o.registrations.byStatus.approved, 'number');
    assert.equal(o.activityLast24h, null, 'registrars lack audit:view');

    const asAdmin = await api().get('/api/admin/reports/overview').set(as(admin));
    assert.equal(typeof asAdmin.body.data.activityLast24h, 'number');
    assert.equal((await api().get('/api/admin/reports/overview').set(as(student))).status, 403);
  });
});
