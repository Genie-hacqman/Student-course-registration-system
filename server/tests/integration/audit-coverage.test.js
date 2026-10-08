import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, auth, query, sectionIdFor, programId, sequelize,
} from './helpers.js';

let admin;
let registrar;
let lecturer;
let student;
let studentId;
let cs201;

const lastRow = async (action) => (await query('SELECT * FROM audit_logs WHERE action = :action ORDER BY id DESC LIMIT 1', { action }))[0];
const metaOf = async (action) => (await lastRow(action)).metadata;

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer, student] = await Promise.all(['admin', 'registrar', 'lecturer', 'student'].map((w) => loginAs(w)));
  studentId = (await query("SELECT id FROM students WHERE student_number = 'STU2025001'"))[0].id;
  cs201 = await sectionIdFor('CS201');

  for (const code of ['CS201', 'CS203']) {
    const res = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor(code) });
    assert.equal(res.status, 201);
  }
  const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
  await api().patch(`/api/admin/registrations/${submitted.body.data.id}/approve`).set(auth(registrar.token)).send({});
});
after(() => sequelize.close());

describe('edits record what changed, not the request body', () => {
  test('course.update lists changed fields with from/to; a long description is "changed" only', async () => {
    const [{ id, title }] = await query("SELECT id, title FROM courses WHERE code = 'CS201'");
    const res = await api().patch(`/api/courses/${id}`).set(auth(registrar.token)).send({ title: 'Data Structures II', description: 'A long text '.repeat(20) });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const meta = await metaOf('course.update');
    assert.equal(meta.code, 'CS201');
    assert.deepEqual(meta.changes.title, { from: title, to: 'Data Structures II' });
    assert.deepEqual(meta.changes.description, { changed: true });
    assert.ok(!JSON.stringify(meta).includes('A long text'), 'the description text is not stored');
  });

  test('saving identical values records no changes', async () => {
    const [{ id, title }] = await query("SELECT id, title FROM courses WHERE code = 'CS201'");
    await api().patch(`/api/courses/${id}`).set(auth(registrar.token)).send({ title });
    const meta = await metaOf('course.update');
    assert.equal(meta.changes, undefined);
    assert.equal(meta.code, 'CS201');
  });

  test('department.update and the archive/activate pair record from/to', async () => {
    const [{ id, name }] = await query("SELECT id, name FROM departments WHERE code = 'MATH'");
    await api().patch(`/api/departments/${id}`).set(auth(admin.token)).send({ name: 'Mathematics and Statistics' });
    assert.deepEqual((await metaOf('department.update')).changes.name, { from: name, to: 'Mathematics and Statistics' });

    await api().post(`/api/departments/${id}/archive`).set(auth(admin.token)).send({});
    assert.deepEqual((await metaOf('department.archive')).changes.status, { from: 'active', to: 'archived' });
    await api().post(`/api/departments/${id}/activate`).set(auth(admin.token)).send({});
    assert.deepEqual((await metaOf('department.activate')).changes.status, { from: 'archived', to: 'active' });
  });

  test('schedule.update records the old and new room and time', async () => {
    const [{ id, room, start_time: start }] = await query('SELECT id, room, start_time FROM schedules ORDER BY id LIMIT 1');
    const res = await api().patch(`/api/schedules/${id}`).set(auth(registrar.token)).send({ room: 'AUD-ROOM-1' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const meta = await metaOf('schedule.update');
    assert.deepEqual(meta.changes, { room: { from: room, to: 'AUD-ROOM-1' } });
    assert.ok(start, 'unchanged fields are not listed');
  });

  test('settings.update records the old and new value of each key that really changed', async () => {
    const res = await api().patch('/api/admin/settings').set(auth(admin.token)).send({
      settings: [
        { key: 'registration.defaultMaxCredits', value: 21 },
        { key: 'registration.requireApproval', value: false },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const meta = await metaOf('settings.update');
    assert.deepEqual(meta.keys, ['registration.defaultMaxCredits', 'registration.requireApproval']);
    assert.deepEqual(meta.changes['registration.defaultMaxCredits'], { from: 24, to: 21 });
    assert.equal(meta.changes['registration.requireApproval'], undefined, 'an unchanged key is not a change');
  });

  test('announcement.update never stores the body', async () => {
    const created = await api().post('/api/announcements').set(auth(registrar.token))
      .send({ title: 'Library hours', body: 'Open late this week.', audience: 'everyone' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    await api().patch(`/api/announcements/${created.body.data.id}`).set(auth(registrar.token)).send({ title: 'Library hours (updated)', body: 'Closed on Friday.' });
    const meta = await metaOf('announcement.update');
    assert.deepEqual(meta.changes.title, { from: 'Library hours', to: 'Library hours (updated)' });
    assert.deepEqual(meta.changes.body, { changed: true });
    assert.ok(!JSON.stringify(meta).includes('Closed on Friday'));
  });

  test('lecturer.update records personal details as "changed" only, never their values', async () => {
    const [{ id, staff_number: staffNumber }] = await query("SELECT id, staff_number FROM lecturers WHERE staff_number = 'STF1001'");
    const res = await api().patch(`/api/lecturers/${id}`).set(auth(admin.token)).send({ phone: '+233 24 000 0000', title: 'Prof.' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const meta = await metaOf('lecturer.update');
    assert.equal(meta.staffNumber, staffNumber);
    assert.deepEqual(meta.changes.phone, { changed: true });
    assert.equal(meta.changes.title.to, 'Prof.');
    assert.ok(!JSON.stringify(meta).includes('000 0000'));
  });

  test('user.update records the real status before and after (it used to record the new status twice)', async () => {
    const made = await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'Temp', lastName: 'Lecturer', email: 'temp.lecturer@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const res = await api().patch(`/api/users/${made.body.data.id}`).set(auth(admin.token)).send({ status: 'suspended', firstName: 'Tempo' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const meta = await metaOf('user.update');
    assert.equal(meta.statusBefore, 'active');
    assert.equal(meta.statusAfter, 'suspended');
    assert.deepEqual(meta.changes.firstName, { from: 'Temp', to: 'Tempo' });
  });
});

describe('teaching changes record per-student from/to', () => {
  const grades = (body) => api().put(`/api/sections/${cs201}/grades`).set(auth(lecturer.token)).send(body);

  test('grades.enter lists each changed grade, and leaves out students whose grade did not change', async () => {
    assert.equal((await grades({ grades: [{ studentId, grade: 'D' }] })).status, 200);
    assert.deepEqual((await metaOf('grades.enter')).entries, [{ studentId, from: null, to: 'D' }]);

    assert.equal((await grades({ grades: [{ studentId, grade: 'B' }] })).status, 200);
    const meta = await metaOf('grades.enter');
    assert.equal(meta.count, 1);
    assert.equal(meta.changed, 1);
    assert.deepEqual(meta.entries, [{ studentId, from: 'D', to: 'B' }]);

    assert.equal((await grades({ grades: [{ studentId, grade: 'B' }] })).status, 200);
    const same = await metaOf('grades.enter');
    assert.equal(same.changed, 0, 're-saving the same grade is not a change');
    assert.deepEqual(same.entries, []);
  });

  test('assessment.score and attendance.update record from/to per student', async () => {
    const assessment = await api().post(`/api/sections/${cs201}/assessments`).set(auth(lecturer.token))
      .send({ title: 'Lab report', type: 'assignment', maxScore: 10, weight: 5, description: 'Private marking notes' });
    assert.equal(assessment.status, 201, JSON.stringify(assessment.body));
    const id = assessment.body.data.id;
    const roster = (await api().get(`/api/assessments/${id}/scores`).set(auth(lecturer.token))).body.data.students;
    const target = roster[0].studentId;

    await api().put(`/api/assessments/${id}/scores`).set(auth(lecturer.token)).send({ scores: [{ studentId: target, score: 8 }] });
    assert.deepEqual((await metaOf('assessment.score')).entries, [{ studentId: target, from: null, to: 8 }]);
    await api().put(`/api/assessments/${id}/scores`).set(auth(lecturer.token)).send({ scores: [{ studentId: target, score: 9 }] });
    assert.deepEqual((await metaOf('assessment.score')).entries, [{ studentId: target, from: 8, to: 9 }]);

    await api().patch(`/api/assessments/${id}`).set(auth(lecturer.token)).send({ weight: 4, description: 'Different private notes' });
    const updated = await metaOf('assessment.update');
    assert.deepEqual(updated.changes.weight, { from: 5, to: 4 });
    assert.deepEqual(updated.changes.description, { changed: true });

    const session = await api().post(`/api/sections/${cs201}/attendance`).set(auth(lecturer.token)).send({ date: '2026-02-03', records: [] });
    assert.equal(session.status, 201, JSON.stringify(session.body));
    await api().put(`/api/attendance/${session.body.data.id}`).set(auth(lecturer.token))
      .send({ topic: 'Recursion', records: [{ studentId: target, status: 'absent' }] });
    const meta = await metaOf('attendance.update');
    assert.equal(meta.changed, 1);
    assert.deepEqual(meta.entries, [{ studentId: target, from: 'present', to: 'absent' }]);
    assert.deepEqual(meta.changes.topic, { from: null, to: 'Recursion' });
  });

  test('results.import records each result it replaced (it overwrites final results silently)', async () => {
    const send = (grade) => api().post('/api/results/import').set(auth(registrar.token))
      .send({ results: [{ studentNumber: 'STU2025001', courseCode: 'CS204', grade }] });
    assert.equal((await send('C')).body.data.imported, 1);
    assert.equal((await metaOf('results.import')).overwritten.changed, 0, 'the first import creates, it replaces nothing');
    assert.equal((await send('A')).body.data.imported, 1);
    const meta = await metaOf('results.import');
    assert.deepEqual(meta.overwritten.entries, [{ studentNumber: 'STU2025001', courseCode: 'CS204', from: 'C', to: 'A' }]);
  });
});

describe('imports and bulk admission', () => {
  const rows = [
    { firstName: 'Ama', lastName: 'Owusu', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'AUD-100' },
    { firstName: 'Kofi', lastName: 'Boateng', programCode: 'BSC-CS', admissionSession: '2026/2027', admissionNumber: 'AUD-101' },
  ];
  const bulk = (body) => api().post('/api/admissions/bulk').set(auth(admin.token)).send(body);

  test('a dry run writes no audit rows at all, even though each admission is audited inside its row', async () => {
    const before = (await query("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('student.admit', 'import.admissions')"))[0].n;
    assert.equal((await bulk({ rows, dryRun: true })).body.data.created, 2);
    assert.equal((await query("SELECT COUNT(*) n FROM audit_logs WHERE action IN ('student.admit', 'import.admissions')"))[0].n, before);
  });

  test('bulk admission writes one student.admit per student, listing them in the summary, and never a PIN', async () => {
    const res = await bulk({ rows });
    assert.equal(res.body.data.created, 2);
    const admits = await query("SELECT * FROM audit_logs WHERE action = 'student.admit' AND JSON_EXTRACT(metadata, '$.via') = 'bulk' ORDER BY id");
    assert.equal(admits.length, 2);
    assert.deepEqual(admits.map((r) => r.metadata.admissionNumber), ['AUD-100', 'AUD-101']);
    assert.deepEqual(admits.map((r) => r.metadata.studentNumber).sort(), res.body.data.credentials.map((c) => c.studentNumber).sort());
    assert.ok(admits.every((r) => r.entity_type === 'Student' && r.entity_id && r.user_id), 'attributed to the admitting admin');

    const summary = await metaOf('import.admissions');
    assert.equal(summary.created, 2);
    assert.equal(summary.rows.changed, 2);
    assert.deepEqual(summary.rows.entries.map((e) => [e.row, e.key, e.outcome]).sort((a, b) => a[0] - b[0]), [[0, 'AUD-100', 'created'], [1, 'AUD-101', 'created']]);

    for (const { pin } of res.body.data.credentials) {
      const [{ n }] = await query('SELECT COUNT(*) n FROM audit_logs WHERE CAST(metadata AS CHAR) LIKE :like', { like: `%${pin}%` });
      assert.equal(Number(n), 0, 'a temporary PIN never appears in the log');
    }
    assert.equal((await query("SELECT COUNT(*) n FROM audit_logs WHERE CAST(metadata AS CHAR) LIKE '%credentials%'"))[0].n, 0);
  });

  test('re-running lists nothing as touched, and a failed row is listed by its key', async () => {
    const again = await bulk({ rows: [...rows, { firstName: 'Bad', lastName: 'Row', programCode: 'NOPE', admissionSession: '2026/2027', admissionNumber: 'AUD-102' }] });
    assert.equal(again.body.data.created, 0);
    assert.equal(again.body.data.failed, 1);
    const summary = await metaOf('import.admissions');
    assert.deepEqual(summary.rows.entries, [{ row: 2, key: 'AUD-102', outcome: 'failed' }]);
    assert.ok(!JSON.stringify(summary).includes('NOPE'), 'error messages are not copied into the log');
  });

  test('a single admission writes its student.admit with the student, inside the same transaction', async () => {
    const res = await api().post('/api/admissions').set(auth(admin.token))
      .send({ firstName: 'Solo', lastName: 'Student', programId: await programId(), admissionSession: '2026/2027' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const row = await lastRow('student.admit');
    assert.equal(row.entity_id, res.body.data.student.id);
    assert.equal(row.metadata.via, 'single');
    assert.equal(row.metadata.studentNumber, res.body.data.credentials.studentNumber);
    assert.ok(row.actor_email, 'the admin is recorded as the actor');
  });
});

describe('the catalogue and the options endpoint', () => {
  test('every action written during these tests is catalogued, so each has a label and group in the UI', async () => {
    const res = await api().get('/api/admin/audit-logs/options').set(auth(admin.token));
    assert.equal(res.status, 200);
    const unlabelled = res.body.data.actions.filter((a) => a.group === 'Other');
    assert.deepEqual(unlabelled, []);
    const login = res.body.data.actions.find((a) => a.action === 'auth.login');
    assert.deepEqual([login.label, login.group], ['Signed in', 'Sign-in and accounts']);
  });
});
