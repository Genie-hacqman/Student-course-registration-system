import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, auth, query, sectionIdFor, programId, createStudent, sequelize,
} from './helpers.js';

let admin;
let registrar;
let math201;
let program;
let n = 0;
let seededRequireApproval;

before(async () => {
  resetDatabase();
  [admin, registrar] = await Promise.all([loginAs('admin'), loginAs('registrar')]);
  math201 = await sectionIdFor('MATH201');
  program = await programId();
  seededRequireApproval = (await query("SELECT value FROM settings WHERE `key` = 'registration.requireApproval'"))[0].value;
});
after(() => sequelize.close());

beforeEach(async () => {
  await setProgramAutoApprove(false);
  await setRequireApproval(true);
  await query("UPDATE schedules SET room = 'LT-4' WHERE course_section_id = :math201", { math201 });
});

const setProgramAutoApprove = async (autoApprove) => {
  const res = await api().patch(`/api/programs/${program}`).set(auth(admin.token)).send({ autoApprove });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res;
};
const setRequireApproval = async (value) => {
  const res = await api().patch('/api/admin/settings').set(auth(admin.token)).send({ settings: [{ key: 'registration.requireApproval', value }] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
};
const add = async (student, code) => {
  const res = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor(code) });
  assert.equal(res.status, 201, `${code}: ${JSON.stringify(res.body)}`);
};
const submit = (student) => api().post('/api/registrations/submit').set(auth(student.token));
const newStudent = async (codes = ['CS201', 'MATH201']) => {
  n += 1;
  const student = await createStudent(`auto${n}`);
  for (const code of codes) await add(student, code);
  return student;
};
const notificationTypes = async (student) =>
  (await api().get('/api/notifications').set(auth(student.token))).body.data.map((x) => x.type).filter((t) => t.startsWith('REGISTRATION_'));
const rowOf = async (id) => (await query('SELECT * FROM registrations WHERE id = :id', { id }))[0];

describe('programme auto-approval', () => {
  test('a programme without the flag still waits for the registrar', async () => {
    const student = await newStudent();
    const res = await submit(student);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'submitted');
    assert.deepEqual(await notificationTypes(student), ['REGISTRATION_SUBMITTED']);

    const pending = await api().get(`/api/admin/registrations?status=submitted&studentId=${student.studentId}`).set(auth(registrar.token));
    assert.equal(pending.body.data.length, 1);
  });

  test('with the flag on, a clean registration is approved on submit as the system', async () => {
    await setProgramAutoApprove(true);
    const student = await newStudent();
    const res = await submit(student);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'approved');
    assert.equal(res.body.data.totalCredits, 6);

    const row = await rowOf(res.body.data.id);
    assert.ok(row.reviewed_at, 'reviewed time is set');
    assert.equal(row.reviewed_by, null, 'no registrar reviewed it');
    assert.ok(row.timetable_confirmed_at, 'the timetable is confirmed');
    assert.ok(row.reference_number);

    assert.deepEqual(await notificationTypes(student), ['REGISTRATION_APPROVED']);
    const approval = (await api().get('/api/notifications').set(auth(student.token))).body.data.find((x) => x.type === 'REGISTRATION_APPROVED');
    assert.equal(approval.data.auto, true);
    assert.equal(approval.data.reference, row.reference_number);

    const [audit] = await query("SELECT * FROM audit_logs WHERE action = 'registration.auto_approved' AND entity_id = :id", { id: res.body.data.id });
    assert.ok(audit, 'the automatic approval is audited');
    assert.equal(audit.user_id, student.userId);
    assert.equal((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'registration.submit' AND entity_id = :id", { id: res.body.data.id }))[0].n, 1);

    const pending = await api().get(`/api/admin/registrations?status=submitted&studentId=${student.studentId}`).set(auth(registrar.token));
    assert.equal(pending.body.data.length, 0, 'nothing for the registrar to approve');
    const timetable = await api().get('/api/timetable/me').set(auth(student.token));
    assert.equal(timetable.body.data.totalCredits, 6);
  });

  test('the rules still apply: a failing selection is refused, not approved', async () => {
    await setProgramAutoApprove(true);
    const student = await newStudent(['CS201']);
    const res = await submit(student);
    assert.equal(res.status, 422);
    assert.deepEqual(res.body.error.details.map((d) => d.rule), ['MINIMUM_CREDITS']);
  });

  test('a timetable problem falls back to the registrar and is recorded for them', async () => {
    await setProgramAutoApprove(true);
    const student = await newStudent();
    await query('UPDATE schedules SET room = NULL WHERE course_section_id = :math201', { math201 });

    const res = await submit(student);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'submitted');
    const row = await rowOf(res.body.data.id);
    assert.equal(row.reviewed_at, null);
    assert.equal(row.timetable_confirmed_at, null);

    const issues = await query("SELECT type, status FROM timetable_issues WHERE registration_id = :id", { id: res.body.data.id });
    assert.deepEqual(issues, [{ type: 'UNSCHEDULED', status: 'open' }]);
    const [note] = (await api().get('/api/notifications').set(auth(student.token))).body.data.filter((x) => x.type === 'REGISTRATION_SUBMITTED');
    assert.match(note.message, /timetable clash/);
    assert.equal((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'registration.auto_approved' AND entity_id = :id", { id: res.body.data.id }))[0].n, 0);

    const approve = () => api().patch(`/api/admin/registrations/${res.body.data.id}/approve`).set(auth(registrar.token)).send({});
    assert.equal((await approve()).status, 409);
    await query("UPDATE schedules SET room = 'LT-4' WHERE course_section_id = :math201", { math201 });
    const approved = await approve();
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.data.status, 'approved');
    assert.equal((await query("SELECT COUNT(*) AS n FROM timetable_issues WHERE registration_id = :id AND status = 'open'", { id: res.body.data.id }))[0].n, 0);
  });

  test('editing an approved registration sends it back, and resubmitting approves it again', async () => {
    await setProgramAutoApprove(true);
    const student = await newStudent(['CS201', 'MATH201', 'CS203']);
    const first = await submit(student);
    assert.equal(first.body.data.status, 'approved');

    const item = first.body.data.items.find((i) => i.section.course.code === 'CS203');
    const dropped = await api().delete(`/api/registrations/items/${item.id}`).set(auth(student.token));
    assert.equal(dropped.status, 200, JSON.stringify(dropped.body));
    assert.equal(dropped.body.data.status, 'submitted');
    assert.equal((await rowOf(first.body.data.id)).timetable_confirmed_at, null);

    const again = await submit(student);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.data.status, 'approved');
    assert.ok((await rowOf(first.body.data.id)).timetable_confirmed_at);
  });

  test('turning the flag off again restores manual approval', async () => {
    await setProgramAutoApprove(true);
    await setProgramAutoApprove(false);
    const student = await newStudent();
    assert.equal((await submit(student)).body.data.status, 'submitted');
  });
});

describe('the global approval switch', () => {
  test('is off by default, so a clean submit is approved by the system', async () => {
    assert.equal(JSON.parse(JSON.stringify(seededRequireApproval)), false, 'the seeded default');
    await query("DELETE FROM settings WHERE `key` = 'registration.requireApproval'");
    const student = await newStudent();
    const res = await submit(student);
    assert.equal(res.body.data.status, 'approved', 'no setting row: the code default applies');
    assert.equal((await rowOf(res.body.data.id)).reviewed_by, null);
  });


  test('switched off, it approves every programme, now through the full approval path', async () => {
    await setRequireApproval(false);
    const student = await newStudent();
    const res = await submit(student);
    assert.equal(res.body.data.status, 'approved');
    const row = await rowOf(res.body.data.id);
    assert.ok(row.timetable_confirmed_at);
    assert.ok(row.reviewed_at);
    assert.deepEqual(await notificationTypes(student), ['REGISTRATION_APPROVED']);
  });

  test('switched off, a timetable problem still goes to the registrar', async () => {
    await setRequireApproval(false);
    const student = await newStudent();
    await query('UPDATE schedules SET room = NULL WHERE course_section_id = :math201', { math201 });
    assert.equal((await submit(student)).body.data.status, 'submitted');
  });
});

describe('the programme flag', () => {
  test('is returned by the programme endpoints and a PATCH without it leaves it alone', async () => {
    const on = await setProgramAutoApprove(true);
    assert.equal(on.body.data.autoApprove, true);

    const renamed = await api().patch(`/api/programs/${program}`).set(auth(admin.token)).send({ maxCredits: 24 });
    assert.equal(renamed.status, 200);
    const read = await api().get(`/api/programs/${program}`).set(auth(admin.token));
    assert.equal(read.body.data.autoApprove, true, 'omitting the field must not reset it');

    const bad = await api().patch(`/api/programs/${program}`).set(auth(admin.token)).send({ autoApprove: 'yes' });
    assert.equal(bad.status, 422);
  });
});
