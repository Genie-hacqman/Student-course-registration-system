/**
 * The staff directory: people organised by department and programme, with counts from the real rows, server-side
 * filters, archive = closed to new intake, lecturers in several departments, and the permission and account rules.
 * Uses only the demo seed (departments CS and MATH, programme BSC-CS) plus records created here.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, auth, query, sequelize, sectionIdFor, createApplicant, submitApplication, completeApplication,
} from './helpers.js';
import * as userService from '../../src/services/user.service.js';

let admin;
let registrar;
let lecturer;
let student;
const ids = {};

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer, student] = await Promise.all(['admin', 'registrar', 'lecturer', 'student'].map((who) => loginAs(who)));
  const depts = await query('SELECT id, code FROM departments');
  ids.cs = depts.find((d) => d.code === 'CS').id;
  ids.math = depts.find((d) => d.code === 'MATH').id;
  ids.bscCs = (await query("SELECT id FROM programs WHERE code = 'BSC-CS'"))[0].id;
  ids.kofi = (await query("SELECT id FROM lecturers WHERE staff_number = 'STF1001'"))[0].id;
  ids.seedStudent = (await query("SELECT id FROM students WHERE student_number = 'STU2025001'"))[0].id;
});
after(() => sequelize.close());

const get = (path, who = admin) => api().get(path).set(auth(who.token));
const post = (path, body, who = admin) => api().post(path).set(auth(who.token)).send(body ?? {});
const put = (path, body, who = admin) => api().put(path).set(auth(who.token)).send(body);
const count = async (sql, replacements) => Number(Object.values((await query(sql, replacements))[0])[0]);
const SECRETS = ['passwordHash', 'password_hash', 'pinOtp', 'activationHash', 'tokenVersion', 'passwordResetHash', 'emailVerificationHash'];
const assertNoSecrets = (res) => {
  const text = JSON.stringify(res.body);
  for (const secret of SECRETS) assert.equal(text.includes(secret), false, `response leaks ${secret}`);
};

/** What the database says a department has, computed independently of the service. */
const expectedCounts = async (departmentId) => ({
  programs: await count('SELECT COUNT(*) FROM programs WHERE department_id = :id', { id: departmentId }),
  students: await count('SELECT COUNT(*) FROM students s JOIN programs p ON p.id = s.program_id WHERE p.department_id = :id', { id: departmentId }),
  lecturers: await count(
    `SELECT COUNT(DISTINCT l.id) FROM lecturers l LEFT JOIN lecturer_departments ld ON ld.lecturer_id = l.id
      WHERE l.department_id = :id OR ld.department_id = :id`, { id: departmentId },
  ),
  courses: await count('SELECT COUNT(*) FROM courses WHERE department_id = :id', { id: departmentId }),
});

describe('counts come from the actual records', () => {
  test('department summary matches the database, and follows new records', async () => {
    const check = async () => {
      const res = await get('/api/departments/summary');
      assert.equal(res.status, 200);
      assertNoSecrets(res);
      for (const id of [ids.cs, ids.math]) {
        const row = res.body.data.find((d) => d.id === id);
        const want = await expectedCounts(id);
        assert.equal(row.counts.programs, want.programs, `programs of ${row.code}`);
        assert.equal(row.counts.students, want.students, `students of ${row.code}`);
        assert.equal(row.counts.lecturers, want.lecturers, `lecturers of ${row.code}`);
        assert.equal(row.counts.courses, want.courses, `courses of ${row.code}`);
      }
      return res.body.data.find((d) => d.id === ids.cs).counts.students;
    };
    const before = await check();
    // A newly admitted student (staff admission into BSC-CS) shows up in CS's count straight away.
    const admitted = await post('/api/admissions', { firstName: 'Count', lastName: 'Check', programId: ids.bscCs, admissionSession: '2026/2027', level: 100 });
    assert.equal(admitted.status, 201, JSON.stringify(admitted.body));
    assert.equal(await check(), before + 1);
  });

  test('department overview breaks students down by programme and level, adding up to the total', async () => {
    const res = await get(`/api/departments/${ids.cs}/overview`);
    assert.equal(res.status, 200);
    const program = res.body.data.programs.find((p) => p.code === 'BSC-CS');
    const byLevel = await query('SELECT level, COUNT(*) AS n FROM students WHERE program_id = :id GROUP BY level ORDER BY level', { id: ids.bscCs });
    assert.deepEqual(program.levels, byLevel.map((r) => ({ level: r.level, students: Number(r.n) })));
    assert.equal(res.body.data.programs.reduce((sum, p) => sum + p.students, 0), res.body.data.counts.students);
  });

  test('students summary: totals per department and overall equal the student table', async () => {
    const res = await get('/api/students/summary');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.total, await count('SELECT COUNT(*) FROM students'));
    const cs = res.body.data.departments.find((d) => d.code === 'CS');
    assert.equal(cs.students, (await expectedCounts(ids.cs)).students);
    const math = res.body.data.departments.find((d) => d.code === 'MATH');
    assert.equal(math.students, 0, 'departments without students are listed with zero');
  });
});

describe('students: department, programme, term and registration filters', () => {
  test('department and programme scopes only return their students, with matching totals', async () => {
    const cs = await get(`/api/departments/${ids.cs}/students?limit=100`);
    assert.equal(cs.status, 200);
    assert.ok(cs.body.data.length > 0);
    assert.ok(cs.body.data.every((s) => s.program.department.id === ids.cs));
    assert.equal(cs.body.meta.total, (await expectedCounts(ids.cs)).students);
    const math = await get(`/api/departments/${ids.math}/students`);
    assert.deepEqual([math.body.data.length, math.body.meta.total], [0, 0]);

    const program = await get(`/api/programs/${ids.bscCs}/students?level=200`);
    assert.equal(program.status, 200);
    assert.ok(program.body.data.every((s) => s.programId === ids.bscCs && s.level === 200));
    assert.equal(program.body.meta.total, await count('SELECT COUNT(*) FROM students WHERE program_id = :id AND level = 200', { id: ids.bscCs }));
  });

  test('registration status is per term, and `none` means not registered at all', async () => {
    const [{ id: semesterId }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const added = await post('/api/registrations/items', { courseSectionId: await sectionIdFor('CS201') }, student);
    assert.equal(added.status, 201, JSON.stringify(added.body));

    const drafts = await get(`/api/students?semesterId=${semesterId}&registrationStatus=draft&limit=100`);
    assert.ok(drafts.body.data.some((s) => s.id === ids.seedStudent));
    assert.ok(drafts.body.data.every((s) => s.registration.status === 'draft'));
    const none = await get(`/api/students?semesterId=${semesterId}&registrationStatus=none&limit=100`);
    assert.ok(!none.body.data.some((s) => s.id === ids.seedStudent));
    assert.ok(none.body.data.every((s) => s.registration.status === null));
    assert.equal(none.body.meta.total + drafts.body.meta.total, await count('SELECT COUNT(*) FROM students'), 'every student is in exactly one bucket here');
  });

  test('admission source: online applicants carry their application number, staff admissions do not', async () => {
    const applicant = await createApplicant(301);
    const application = await submitApplication(applicant);
    const admitted = await post(`/api/applications/${application.id}/admit`, {});
    assert.equal(admitted.status, 200, JSON.stringify(admitted.body));
    const list = await get('/api/students?limit=100&sort=name');
    const online = list.body.data.find((s) => s.id === admitted.body.data.application.student.id);
    assert.deepEqual(online.admission.source, 'online');
    assert.equal(online.admission.applicationNumber, `APP${String(application.id).padStart(6, '0')}`);
    assert.equal(list.body.data.find((s) => s.id === ids.seedStudent).admission.source, 'staff');
    assertNoSecrets(list);
  });

  test('search and pagination are done by the server', async () => {
    const page = await get('/api/students?limit=1&page=1');
    assert.equal(page.body.data.length, 1);
    assert.equal(page.body.meta.totalPages, page.body.meta.total);
    const found = await get('/api/students?search=STU2025001');
    assert.deepEqual(found.body.data.map((s) => s.studentNumber), ['STU2025001']);
  });
});

describe('lecturers in more than one department', () => {
  test('additional departments: rules, listings, counts and course assignment', async () => {
    const math201 = await sectionIdFor('MATH201');
    // With the department restriction on, a CS lecturer can't take a MATH course...
    const refused = await put(`/api/sections/${math201}/lecturer`, { lecturerId: ids.kofi }, registrar);
    assert.equal(refused.status, 400);

    // ...until MATH is one of their departments. Duplicates collapse; the home department can't be repeated.
    assert.equal((await put(`/api/lecturers/${ids.kofi}/departments`, { departmentIds: [ids.cs] })).status, 400);
    const set = await put(`/api/lecturers/${ids.kofi}/departments`, { departmentIds: [ids.math, ids.math] });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.deepEqual(set.body.data.additionalDepartments.map((d) => d.code), ['MATH']);
    assert.equal(await count('SELECT COUNT(*) FROM lecturer_departments WHERE lecturer_id = :id', { id: ids.kofi }), 1);

    const mathLecturers = await get(`/api/departments/${ids.math}/lecturers`);
    assert.deepEqual(mathLecturers.body.data.map((l) => [l.staffNumber, l.membership]), [['STF1001', 'additional']]);
    const csLecturers = await get(`/api/departments/${ids.cs}/lecturers`);
    assert.equal(csLecturers.body.data.find((l) => l.staffNumber === 'STF1001').membership, 'home');
    const filtered = await get(`/api/lecturers?departmentId=${ids.math}`, registrar);
    assert.ok(filtered.body.data.some((l) => l.id === ids.kofi));
    const summary = await get('/api/departments/summary');
    assert.equal(summary.body.data.find((d) => d.id === ids.math).counts.lecturers, (await expectedCounts(ids.math)).lecturers);

    const assigned = await put(`/api/sections/${math201}/lecturer`, { lecturerId: ids.kofi }, registrar);
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    assert.equal((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'lecturer.departments_update'"))[0].n > 0, true);

    // The profile shows the additional department and the teaching timetable.
    const profile = await get(`/api/lecturers/${ids.kofi}`, registrar);
    assert.deepEqual(profile.body.data.additionalDepartments.map((d) => d.code), ['MATH']);
    assert.ok(profile.body.data.assignments.some((a) => Array.isArray(a.section.schedules)));
    // The teaching timetable comes from the offerings they actually teach this term, seed ones included.
    const teaching = profile.body.data.currentTeaching.map((t) => t.course.code);
    const expected = (await query(
      `SELECT c.code FROM course_sections cs JOIN courses c ON c.id = cs.course_id JOIN semesters s ON s.id = cs.semester_id
        WHERE cs.lecturer_id = :id AND cs.status <> 'cancelled' AND s.is_current = 1 ORDER BY c.code`, { id: ids.kofi },
    )).map((r) => r.code);
    assert.deepEqual(teaching, expected);
    assert.ok(teaching.includes('CS201') && teaching.includes('MATH201'));
    assertNoSecrets(profile);

    // Tidy up so later tests start from the seed shape.
    await api().delete(`/api/sections/${math201}/lecturer`).set(auth(registrar.token)).send({});
    assert.equal((await put(`/api/lecturers/${ids.kofi}/departments`, { departmentIds: [] })).status, 200);
  });
});

describe('archive = closed to new intake', () => {
  test('an archived department refuses new programmes, courses and lecturer links, and reactivates', async () => {
    const archived = await post(`/api/departments/${ids.math}/archive`);
    assert.equal(archived.status, 200);
    assert.equal(archived.body.data.status, 'archived');
    assert.equal((await post(`/api/departments/${ids.math}/archive`)).status, 409, 'already archived');

    assert.equal((await post('/api/programs', { departmentId: ids.math, name: 'Test Programme', code: 'TST-MATH' })).status, 409);
    assert.equal((await post('/api/courses', { departmentId: ids.math, code: 'TST900', title: 'Test', credits: 3, level: 100 }, registrar)).status, 409);
    assert.equal((await put(`/api/lecturers/${ids.kofi}/departments`, { departmentIds: [ids.math] })).status, 409);
    // Still visible, with everything it already had.
    const listed = await get('/api/departments/summary?status=archived');
    assert.deepEqual(listed.body.data.map((d) => d.code), ['MATH']);
    assert.equal((await get(`/api/departments/${ids.math}/overview`)).status, 200);

    assert.equal((await post(`/api/departments/${ids.math}/activate`)).body.data.status, 'active');
    assert.equal((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action IN ('department.archive', 'department.activate')"))[0].n, 2);
  });

  test('an archived programme is hidden from applicants and refuses applications, admissions and transfers', async () => {
    const extra = await post('/api/programs', { departmentId: ids.cs, name: 'Directory Test Programme', code: 'DIR-TEST' });
    assert.equal(extra.status, 201);
    ids.extra = extra.body.data.id;
    const mover = (await post('/api/admissions', { firstName: 'Move', lastName: 'Me', programId: ids.extra, admissionSession: '2026/2027', level: 100 })).body.data.student;

    assert.equal((await post(`/api/programs/${ids.bscCs}/archive`)).status, 200);
    const options = await api().get('/api/applications/options').set(auth((await createApplicant(302)).token));
    assert.equal(options.status, 200);
    const csOption = options.body.data.find((d) => d.code === 'CS');
    assert.ok(!csOption.programs.some((p) => p.code === 'BSC-CS'), 'applicants no longer see it');

    const applicant = await createApplicant(303);
    const save = await api().put('/api/applications/me').set(auth(applicant.token)).send(await completeApplication());
    assert.equal(save.status, 409);
    assert.equal((await post('/api/admissions', { firstName: 'No', lastName: 'Room', programId: ids.bscCs, admissionSession: '2026/2027', level: 100 })).status, 409);
    assert.equal((await api().patch(`/api/students/${mover.id}`).set(auth(admin.token)).send({ programId: ids.bscCs })).status, 409);
    // Existing students stay put and visible.
    assert.equal((await get(`/api/programs/${ids.bscCs}/students`)).body.meta.total > 0, true);

    // A programme can't be reactivated while its department is archived.
    assert.equal((await post(`/api/departments/${ids.cs}/archive`)).status, 200);
    const blocked = await post(`/api/programs/${ids.bscCs}/activate`);
    assert.equal(blocked.status, 409);
    assert.match(blocked.body.error.message, /Activate Computer Science first/);
    assert.equal((await post(`/api/departments/${ids.cs}/activate`)).status, 200);
    assert.equal((await post(`/api/programs/${ids.bscCs}/activate`)).body.data.status, 'active');
  });

  test('pickers can ask for open ones only', async () => {
    assert.equal((await post(`/api/programs/${ids.extra}/archive`)).status, 200);
    const open = await api().get('/api/programs?status=active');
    assert.ok(open.body.data.every((p) => p.status === 'active'));
    assert.ok(!open.body.data.some((p) => p.id === ids.extra));
    const all = await api().get('/api/programs');
    assert.ok(all.body.data.some((p) => p.id === ids.extra), 'without a filter, archived ones are still listed');
    assert.ok((await get('/api/departments?status=active')).body.data.every((d) => d.status === 'active'));
  });
});

describe('permissions are enforced by the server', () => {
  test('directory reads: admins and registrars yes; lecturers and students no', async () => {
    const reads = [
      '/api/departments/summary', `/api/departments/${ids.cs}/overview`, `/api/departments/${ids.cs}/lecturers`,
      `/api/departments/${ids.cs}/students`, `/api/programs/${ids.bscCs}/students`, '/api/students/summary',
    ];
    for (const path of reads) {
      assert.equal((await get(path, admin)).status, 200, `admin ${path}`);
      assert.equal((await get(path, registrar)).status, 200, `registrar ${path}`);
      assert.equal((await get(path, lecturer)).status, 403, `lecturer ${path}`);
      assert.equal((await get(path, student)).status, 403, `student ${path}`);
      assert.equal((await api().get(path)).status, 401, `anonymous ${path}`);
    }
  });

  test('registrars browse but do not archive, edit structure or manage accounts', async () => {
    assert.equal((await post(`/api/departments/${ids.math}/archive`, {}, registrar)).status, 403);
    assert.equal((await post(`/api/programs/${ids.bscCs}/archive`, {}, registrar)).status, 403);
    assert.equal((await put(`/api/lecturers/${ids.kofi}/departments`, { departmentIds: [] }, registrar)).status, 403);
    assert.equal((await get('/api/users/role-responsibilities', registrar)).status, 403);
    assert.equal((await get('/api/users?role=ADMIN,REGISTRAR', registrar)).status, 403);
  });

  test('a lecturer still reaches only the class lists of sections they teach', async () => {
    const notTheirs = await sectionIdFor('MATH201');
    assert.equal((await get(`/api/lecturers/sections/${notTheirs}/roster`, lecturer)).status, 403);
    assert.equal((await get(`/api/lecturers/sections/${await sectionIdFor('CS201')}/roster`, lecturer)).status, 200);
  });

  test('administrators & registrars directory and their responsibilities', async () => {
    const staff = await get('/api/users?role=ADMIN,REGISTRAR&limit=100');
    assert.equal(staff.status, 200);
    assert.ok(staff.body.data.length >= 2);
    assert.ok(staff.body.data.every((u) => ['ADMIN', 'REGISTRAR'].includes(u.role.name)));
    assertNoSecrets(staff);
    const roles = await get('/api/users/role-responsibilities');
    assert.deepEqual(roles.body.data.map((r) => r.role), ['ADMIN', 'REGISTRAR']);
    assert.ok(roles.body.data[0].permissions.every((p) => p.description && p.group));
    const byDepartment = await get(`/api/users?departmentId=${ids.cs}&limit=100`);
    assert.ok(byDepartment.body.data.length > 0);
    assert.ok(byDepartment.body.data.every((u) => u.student?.program?.department?.id === ids.cs || u.lecturer));
  });
});

describe('privileged accounts are protected', () => {
  test('only an administrator may create or change administrator and registrar accounts, even with user:manage granted', async () => {
    const [{ id: registrarRole }] = await query("SELECT id FROM roles WHERE name = 'REGISTRAR'");
    const grant = await put(`/api/admin/roles/${registrarRole}/permissions`, {
      permissions: [...(await get('/api/admin/roles')).body.data.find((r) => r.name === 'REGISTRAR').permissions, 'user:manage'],
    });
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    try {
      const promote = await post('/api/users', { firstName: 'Not', lastName: 'Allowed', email: 'escalate@test.local', role: 'ADMIN' }, registrar);
      assert.equal(promote.status, 403);
      assert.equal(promote.body.error.code, 'PRIVILEGED_ACCOUNT');
      assert.equal((await post('/api/users', { firstName: 'Also', lastName: 'Not', email: 'escalate2@test.local', role: 'REGISTRAR' }, registrar)).status, 403);
      const [{ id: adminId }] = await query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN' LIMIT 1");
      assert.equal((await api().patch(`/api/users/${adminId}`).set(auth(registrar.token)).send({ status: 'suspended' })).status, 403);
      // Ordinary accounts are still theirs to manage.
      const lecturerUser = await post('/api/users', { firstName: 'Fine', lastName: 'Lecturer', email: 'fine.lecturer@test.local', role: 'LECTURER' }, registrar);
      assert.equal(lecturerUser.status, 201);
      assert.equal((await api().patch(`/api/users/${lecturerUser.body.data.id}`).set(auth(registrar.token)).send({ role: 'ADMIN' })).status, 403, 'and cannot promote them');
    } finally {
      const revert = await put(`/api/admin/roles/${registrarRole}/permissions`, {
        permissions: (await get('/api/admin/roles')).body.data.find((r) => r.name === 'REGISTRAR').permissions.filter((p) => p !== 'user:manage'),
      });
      assert.equal(revert.status, 200);
    }
  });

  test('nobody changes their own role or status; the last active administrator is kept', async () => {
    const me = (await get('/api/auth/me')).body.data;
    const self = await api().patch(`/api/users/${me.id}`).set(auth(admin.token)).send({ role: 'REGISTRAR' });
    assert.equal(self.status, 403);
    assert.equal(self.body.error.code, 'SELF_CHANGE');
    assert.equal((await api().patch(`/api/users/${me.id}`).set(auth(admin.token)).send({ status: 'suspended' })).status, 403);
    // Defence in depth: even a direct service call can't remove the only active administrator.
    await assert.rejects(
      userService.update(me.id, { status: 'suspended' }, { id: 999999, role: 'ADMIN' }),
      (err) => err.statusCode === 409 && err.details?.code === 'LAST_ADMIN',
    );
    const [{ n }] = await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'user.create' AND ip_address IS NOT NULL");
    assert.ok(Number(n) > 0, 'account changes are audited with the request');
  });
});

describe('validation', () => {
  test('bad ids and query values are rejected; unknown ids are 404', async () => {
    assert.equal((await get('/api/departments/abc/overview')).status, 422);
    assert.equal((await get('/api/departments/summary?limit=1000')).status, 422);
    assert.equal((await get('/api/students?registrationStatus=bogus')).status, 422);
    assert.equal((await get('/api/students?academicHold=maybe')).status, 422);
    assert.equal((await get('/api/users?role=ADMIN,KING')).status, 422);
    assert.equal((await put(`/api/lecturers/${ids.kofi}/departments`, { departmentIds: ['x'] })).status, 422);
    assert.equal((await get('/api/departments/999999/overview')).status, 404);
    assert.equal((await get('/api/departments/999999/students')).status, 404);
    assert.equal((await get('/api/programs/999999/students')).status, 404);
    assert.equal((await put('/api/lecturers/999999/departments', { departmentIds: [] })).status, 404);
  });
});
