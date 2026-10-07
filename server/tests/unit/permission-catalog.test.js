import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMISSIONS, PERMISSION_CATALOG } from '../../src/utils/constants.js';

test('every permission appears in the roles-editor catalog exactly once', () => {
  const names = PERMISSION_CATALOG.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual([...names].sort(), Object.values(PERMISSIONS).sort());
});

test('there are exactly four roles, each with its own permission set, and nothing else gets permissions', async () => {
  const { ROLES, ROLE_PERMISSIONS, EDITABLE_ROLES } = await import('../../src/utils/constants.js');
  const { permissionsFor } = await import('../../src/services/permission.service.js');
  assert.deepEqual(Object.values(ROLES).sort(), ['ADMIN', 'LECTURER', 'REGISTRAR', 'STUDENT']);
  assert.deepEqual(Object.keys(ROLE_PERMISSIONS).sort(), ['ADMIN', 'LECTURER', 'REGISTRAR', 'STUDENT']);
  assert.deepEqual([...EDITABLE_ROLES].sort(), ['LECTURER', 'REGISTRAR'], 'ADMIN and STUDENT are fixed');
  for (const removed of ['SUPER_ADMIN', 'USER', 'ACADEMIC_ADVISOR', 'APPLICANT']) {
    assert.deepEqual(permissionsFor(removed), [], `${removed} has no permissions`);
  }
  const admin = permissionsFor('ADMIN');
  const registrar = permissionsFor('REGISTRAR');
  for (const p of ['user:manage', 'application:review', 'student:admit', 'role:manage', 'settings:manage', 'account:approve', 'audit:view']) {
    assert.ok(admin.includes(p), `ADMIN has ${p}`);
    assert.ok(!registrar.includes(p), `REGISTRAR lacks ${p}`);
  }
  for (const p of ['course:catalog', 'lecturer:assign', 'section:manage', 'semester:manage', 'registration:approve', 'grade:manage', 'prerequisite:override']) {
    assert.ok(registrar.includes(p), `REGISTRAR has ${p}`);
    assert.ok(!admin.includes(p), `ADMIN lacks ${p}`);
  }
  assert.ok(admin.includes('directory:view') && registrar.includes('directory:view'));
  assert.ok(!permissionsFor('LECTURER').includes('directory:view'));
  assert.deepEqual(permissionsFor('STUDENT').sort(), ['application:self', 'registration:self']);
});
