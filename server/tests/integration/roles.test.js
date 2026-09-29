/**
 * The four-role model (ADMIN, REGISTRAR, LECTURER, STUDENT): what exists, who may do what, and the
 * migration from the old seven roles.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Sequelize } from 'sequelize';
import {
  resetDatabase, api, loginAs, auth, query, sectionIdFor, sequelize,
} from './helpers.js';

const require = createRequire(import.meta.url);
const fourRoles = require('../../migrations/20261009000001-four-roles.cjs');

const who = {};
before(async () => {
  resetDatabase();
  for (const name of ['admin', 'registrar', 'lecturer', 'student']) who[name] = await loginAs(name);
});
after(() => sequelize.close());

const call = (method, path, session, body) => {
  const req = api()[method](path).set(auth(session.token));
  return body ? req.send(body) : req;
};

describe('exactly four roles', () => {
  test('the database holds ADMIN, REGISTRAR, LECTURER and STUDENT only', async () => {
    const names = (await query('SELECT name FROM roles ORDER BY name')).map((r) => r.name);
    assert.deepEqual(names, ['ADMIN', 'LECTURER', 'REGISTRAR', 'STUDENT']);
  });

  test('each demo account signs in with its role', async () => {
    const expected = { admin: 'ADMIN', registrar: 'REGISTRAR', lecturer: 'LECTURER', student: 'STUDENT' };
    for (const [account, role] of Object.entries(expected)) {
      const me = await call('get', '/api/auth/me', who[account]);
      assert.equal(me.body.data.role.name, role, account);
    }
    const student = await call('get', '/api/auth/me', who.student);
    assert.equal(student.body.data.admissionStatus, 'ADMITTED');
    assert.equal((await call('get', '/api/auth/me', who.admin)).body.data.admissionStatus, undefined, 'staff have no admission status');
  });

  test('accounts cannot be given a removed role', async () => {
    for (const role of ['SUPER_ADMIN', 'USER', 'ACADEMIC_ADVISOR', 'APPLICANT']) {
      const res = await call('post', '/api/users', who.admin, { firstName: 'X', lastName: 'Y', email: `${role.toLowerCase()}@test.local`, role });
      assert.equal(res.status, 422, role);
    }
  });
});

describe('who may do what (enforced by the API)', () => {
  test('ADMIN: accounts, lecturers, admission, departments/programmes, settings, roles, audit — not academics', async () => {
    const [{ id: dept }] = await query("SELECT id FROM departments WHERE code = 'CS'");
    const allowed = [
      ['get', '/api/users'], ['get', '/api/lecturers'], ['get', '/api/applications'], ['get', '/api/admin/settings'],
      ['get', '/api/admin/roles'], ['get', '/api/admin/audit-logs'], ['get', '/api/students'], ['get', '/api/admin/reports/overview'],
    ];
    for (const [m, path] of allowed) assert.equal((await call(m, path, who.admin)).status, 200, `${m} ${path}`);
    assert.equal((await call('post', '/api/departments', who.admin, { name: 'Physics', code: 'PHY' })).status, 201);

    const cs201 = await sectionIdFor('CS201');
    const refused = [
      ['post', '/api/courses', { departmentId: dept, code: 'ADM101', title: 'No', credits: 3, level: 100 }],
      ['post', '/api/semesters', {}],
      ['patch', `/api/sections/${cs201}`, { capacity: 50 }],
      ['put', `/api/sections/${cs201}/lecturer`, { lecturerId: 1 }],
      ['patch', '/api/admin/registrations/1/approve', {}],
      ['post', '/api/admin/import/course-catalog', { rows: [{}] }],
    ];
    for (const [m, path, body] of refused) assert.equal((await call(m, path, who.admin, body)).status, 403, `${m} ${path}`);
  });

  test('REGISTRAR: courses, offerings, lecturer assignment, registrations — not accounts, admission or settings', async () => {
    const [{ id: dept }] = await query("SELECT id FROM departments WHERE code = 'CS'");
    assert.equal((await call('post', '/api/courses', who.registrar, { departmentId: dept, code: 'REG101', title: 'Registry Course', credits: 3, level: 100 })).status, 201);
    assert.equal((await call('post', '/api/admin/import/course-catalog', who.registrar, { dryRun: true, rows: [{ courseCode: 'REG102' }] })).status, 200);
    assert.equal((await call('patch', `/api/sections/${await sectionIdFor('CS201')}`, who.registrar, { capacity: 45 })).status, 200);
    assert.equal((await call('get', '/api/admin/registrations', who.registrar)).status, 200);

    const refused = [
      ['get', '/api/users'], ['post', '/api/lecturers', { firstName: 'a' }], ['get', '/api/applications'],
      ['post', '/api/admissions', {}], ['get', '/api/admin/settings'], ['get', '/api/admin/roles'], ['get', '/api/admin/audit-logs'],
      ['post', '/api/departments', { name: 'Chem', code: 'CHM' }],
    ];
    for (const [m, path, body] of refused) assert.equal((await call(m, path, who.registrar, body)).status, 403, `${m} ${path}`);
  });

  test('LECTURER: own teaching only — no registry or admin routes, no self-assignment', async () => {
    assert.equal((await call('get', '/api/lecturers/me/sections', who.lecturer)).status, 200);
    const cs201 = await sectionIdFor('CS201');
    const [{ id: myLecturerId }] = await query("SELECT l.id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email = 'lecturer@scrs.local'");
    const refused = [
      ['put', `/api/sections/${cs201}/lecturer`, { lecturerId: myLecturerId }], ['post', '/api/courses', {}], ['post', '/api/sections', {}],
      ['get', '/api/admin/registrations'], ['patch', '/api/admin/registrations/1/approve', {}], ['get', '/api/users'],
      ['post', '/api/admissions', {}], ['get', '/api/admin/settings'],
    ];
    for (const [m, path, body] of refused) assert.equal((await call(m, path, who.lecturer, body)).status, 403, `${m} ${path}`);
  });

  test('STUDENT: own registration only — no staff routes', async () => {
    assert.equal((await call('get', '/api/registrations/current', who.student)).status, 200);
    const refused = [
      ['get', '/api/users'], ['get', '/api/admin/registrations'], ['patch', '/api/admin/registrations/1/approve', {}],
      ['post', '/api/courses', {}], ['post', '/api/lecturers', {}], ['put', `/api/sections/${await sectionIdFor('CS201')}/lecturer`, { lecturerId: 1 }],
      ['get', '/api/applications'], ['get', '/api/students'], ['get', '/api/admin/settings'],
    ];
    for (const [m, path, body] of refused) assert.equal((await call(m, path, who.student, body)).status, 403, `${m} ${path}`);
  });
});

describe('migration from the seven old roles', () => {
  test('USER→STUDENT, SUPER_ADMIN→ADMIN, ACADEMIC_ADVISOR→REGISTRAR, APPLICANT→STUDENT; nothing lost', async () => {
    // Recreate the pre-migration state: old role rows, users holding them, an applicant's application.
    await query("UPDATE roles SET name = 'USER' WHERE name = 'STUDENT'");
    for (const name of ['SUPER_ADMIN', 'ACADEMIC_ADVISOR', 'APPLICANT']) {
      await query('INSERT INTO roles (name, description, created_at, updated_at) VALUES (:name, :name, NOW(), NOW())', { name });
    }
    const roleId = async (name) => (await query('SELECT id FROM roles WHERE name = :name', { name }))[0].id;
    const plant = async (email, role) => {
      await query(
        `INSERT INTO users (role_id, first_name, last_name, email, password_hash, status, token_version, created_at, updated_at)
         VALUES (:roleId, 'Old', :role, :email, '!invite-pending', 'active', 3, NOW(), NOW())`,
        { roleId: await roleId(role), role, email },
      );
      return (await query('SELECT id FROM users WHERE email = :email', { email }))[0].id;
    };
    const superId = await plant('old.super@test.local', 'SUPER_ADMIN');
    const advisorId = await plant('old.advisor@test.local', 'ACADEMIC_ADVISOR');
    const applicantId = await plant('old.applicant@test.local', 'APPLICANT');
    await query(
      `INSERT INTO admission_applications (user_id, personal_email, first_name, last_name, status, created_at, updated_at)
       VALUES (:applicantId, 'old.applicant@test.local', 'Old', 'Applicant', 'submitted', NOW(), NOW())`,
      { applicantId },
    );
    await query(
      "INSERT INTO role_permission_overrides (role_id, permission, granted, created_at, updated_at) VALUES (:advisorRole, 'report:view', 1, NOW(), NOW())",
      { advisorRole: await roleId('ACADEMIC_ADVISOR') },
    );
    const [{ n: studentsBefore }] = await query("SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'USER'");

    await fourRoles.up(sequelize.getQueryInterface(), Sequelize);

    assert.deepEqual((await query('SELECT name FROM roles ORDER BY name')).map((r) => r.name), ['ADMIN', 'LECTURER', 'REGISTRAR', 'STUDENT']);
    const roleOf = async (id) => (await query('SELECT r.name, u.token_version FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :id', { id }))[0];
    assert.deepEqual(await roleOf(superId), { name: 'ADMIN', token_version: 4 }, 'moved, and signed out');
    assert.deepEqual(await roleOf(advisorId), { name: 'REGISTRAR', token_version: 4 });
    assert.deepEqual(await roleOf(applicantId), { name: 'STUDENT', token_version: 4 });

    const [{ n: studentsAfter }] = await query("SELECT COUNT(*) AS n FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'STUDENT'");
    assert.equal(Number(studentsAfter), Number(studentsBefore) + 1, 'every former USER is a STUDENT, plus the applicant');
    const [application] = await query('SELECT status, first_name FROM admission_applications WHERE user_id = :applicantId', { applicantId });
    assert.deepEqual([application.status, application.first_name], ['submitted', 'Old'], 'application data kept');
    assert.equal(Number((await query('SELECT COUNT(*) AS n FROM role_permission_overrides'))[0].n), 0, 'overrides of removed roles dropped');

    // Idempotent: running it again changes nothing.
    await fourRoles.up(sequelize.getQueryInterface(), Sequelize);
    assert.deepEqual((await query('SELECT name FROM roles ORDER BY name')).map((r) => r.name), ['ADMIN', 'LECTURER', 'REGISTRAR', 'STUDENT']);
    assert.equal((await roleOf(superId)).token_version, 4);
  });
});
