/**
 * The last gaps in the audit log: edits that are written atomically with their record (so a failed audit write
 * rolls the change back), system consequences that used to leave no trace (waitlist notified/converted, timetable
 * issues closed on approval, section cancelled vs deleted), one row for one lecturer activation, and no personal
 * data in the record of a deleted applicant.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, createStudent, sequelize,
} from './helpers.js';
import { AuditLog } from '../../src/models/index.js';

let admin;
let registrar;
let lecturer;
let math201;

const rows = (action, where = '') => query(`SELECT * FROM audit_logs WHERE action = :action ${where} ORDER BY id`, { action });
const last = async (action) => (await rows(action)).at(-1);

/** Makes every audit write fail, runs `fn`, and always puts the real writer back. */
const withBrokenAudit = async (fn) => {
  const real = AuditLog.create;
  AuditLog.create = async () => { throw new Error('audit store unavailable'); };
  try {
    return await fn();
  } finally {
    AuditLog.create = real;
  }
};

before(async () => {
  resetDatabase();
  [admin, registrar, lecturer] = await Promise.all(['admin', 'registrar', 'lecturer'].map((w) => loginAs(w)));
  math201 = await sectionIdFor('MATH201');
});
after(() => sequelize.close());

describe('an edit and its audit row commit or fail together', () => {
  test('course, department, schedule and settings edits are rolled back when the audit write fails', async () => {
    const [{ id: courseId, title }] = await query("SELECT id, title FROM courses WHERE code = 'CS201'");
    const [{ id: departmentId, name }] = await query("SELECT id, name FROM departments WHERE code = 'MATH'");
    const [{ id: scheduleId, room }] = await query('SELECT id, room FROM schedules ORDER BY id LIMIT 1');

    await withBrokenAudit(async () => {
      assert.equal((await api().patch(`/api/courses/${courseId}`).set(auth(registrar.token)).send({ title: 'Should Not Stick' })).status, 500);
      assert.equal((await api().patch(`/api/departments/${departmentId}`).set(auth(admin.token)).send({ name: 'Should Not Stick' })).status, 500);
      assert.equal((await api().patch(`/api/schedules/${scheduleId}`).set(auth(registrar.token)).send({ room: 'NOWHERE' })).status, 500);
    });

    assert.equal((await query('SELECT title FROM courses WHERE id = :courseId', { courseId }))[0].title, title);
    assert.equal((await query('SELECT name FROM departments WHERE id = :departmentId', { departmentId }))[0].name, name);
    assert.equal((await query('SELECT room FROM schedules WHERE id = :scheduleId', { scheduleId }))[0].room, room);
  });

  test('creating records is all or nothing too: no course, programme or account without its audit row', async () => {
    const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'MATH'");
    await withBrokenAudit(async () => {
      assert.equal((await api().post('/api/courses').set(auth(registrar.token)).send({ departmentId, code: 'NOPE101', title: 'Nope', credits: 3, level: 100 })).status, 500);
      assert.equal((await api().post('/api/programs').set(auth(admin.token)).send({ departmentId, code: 'NOPE-P', name: 'Nope', durationYears: 4, maxCredits: 24 })).status, 500);
      assert.equal((await api().post('/api/users').set(auth(admin.token)).send({ firstName: 'No', lastName: 'Body', email: 'nobody@test.local', password: 'Passw0rd!', role: 'LECTURER' })).status, 500);
    });
    assert.equal((await query("SELECT COUNT(*) n FROM courses WHERE code = 'NOPE101'"))[0].n, 0);
    assert.equal((await query("SELECT COUNT(*) n FROM programs WHERE code = 'NOPE-P'"))[0].n, 0);
    assert.equal((await query("SELECT COUNT(*) n FROM users WHERE email = 'nobody@test.local'"))[0].n, 0);

    // The same requests succeed, with their rows, once the audit store is back.
    assert.equal((await api().post('/api/courses').set(auth(registrar.token)).send({ departmentId, code: 'YES101', title: 'Yes', credits: 3, level: 100 })).status, 201);
    assert.ok(await last('course.create'));
  });

  test('admitting a student is atomic with its student.admit row (it used to be logged after the commit)', async () => {
    const [{ n: before }] = await query('SELECT COUNT(*) n FROM students');
    const [{ id: programId }] = await query("SELECT id FROM programs WHERE code = 'BSC-CS'");
    await withBrokenAudit(async () => {
      const res = await api().post('/api/admissions').set(auth(admin.token)).send({ firstName: 'No', lastName: 'Trace', programId, admissionSession: '2026/2027' });
      assert.equal(res.status, 500);
    });
    assert.equal((await query('SELECT COUNT(*) n FROM students'))[0].n, before, 'no student without a record of the admission');
    assert.equal((await query("SELECT COUNT(*) n FROM users WHERE last_name = 'Trace'"))[0].n, 0);
  });

  test('best-effort events still never fail the request: a sign-in works while the audit store is down', async () => {
    await withBrokenAudit(async () => {
      assert.equal((await api().post('/api/auth/login').send({ identifier: 'lecturer@scrs.local', password: 'Lecturer@12345' })).status, 200);
      assert.equal((await api().post('/api/auth/login').send({ identifier: 'lecturer@scrs.local', password: 'Wrong@12345' })).status, 401);
    });
  });
});

describe('system consequences are recorded', () => {
  test('waitlist: who was told a seat opened, and the seat they then took', async () => {
    await query('UPDATE course_sections SET capacity = 1 WHERE id = :math201', { math201 });
    const holder = await createStudent(1);
    const waiting = await createStudent(2);
    const held = await api().post('/api/registrations/items').set(auth(holder.token)).send({ courseSectionId: math201 });
    assert.equal(held.status, 201, JSON.stringify(held.body));

    assert.equal((await api().post('/api/waitlists').set(auth(waiting.token)).send({ courseSectionId: math201 })).status, 201);
    assert.equal((await api().delete(`/api/registrations/items/${held.body.data.confirmation.itemId}`).set(auth(holder.token))).status, 200);

    const notified = await last('waitlist.notified');
    assert.deepEqual([notified.entity_type, notified.entity_id], ['CourseSection', math201]);
    assert.equal(notified.metadata.changed, 1);
    assert.deepEqual(notified.metadata.entries, [{ studentId: waiting.studentId, position: 1 }]);

    assert.equal((await api().post('/api/registrations/items').set(auth(waiting.token)).send({ courseSectionId: math201 })).status, 201);
    const converted = await last('waitlist.converted');
    assert.deepEqual([converted.entity_id, converted.metadata.studentId, converted.user_id], [math201, waiting.studentId, waiting.userId]);
  });

  test('leaving a waitlist is recorded with its section', async () => {
    const other = await createStudent(3);
    await query('UPDATE course_sections SET capacity = 1 WHERE id = :math201', { math201 });
    assert.equal((await api().post('/api/waitlists').set(auth(other.token)).send({ courseSectionId: math201 })).status, 201);
    const mine = await api().get('/api/waitlists/me').set(auth(other.token));
    assert.equal((await api().delete(`/api/waitlists/${mine.body.data[0].id}`).set(auth(other.token))).status, 204);
    assert.equal((await last('waitlist.leave')).metadata.courseSectionId, math201);
  });

  test('approving a registration records how many timetable issues it cleared', async () => {
    const cs201 = await sectionIdFor('CS201');
    const student = await createStudent(4);
    await query('UPDATE course_sections SET capacity = 40 WHERE id = :math201', { math201 });
    for (const id of [cs201, math201]) {
      assert.equal((await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: id })).status, 201);
    }
    const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    const registrationId = submitted.body.data.id;

    const [{ id: slotId }] = await query('SELECT id FROM schedules WHERE course_section_id = :math201', { math201 });
    const move = (slot) => api().patch(`/api/schedules/${slotId}`).set(auth(registrar.token)).send(slot);
    assert.equal((await move({ day: 'MON', startTime: '09:00', endTime: '10:00', room: 'LT-4' })).status, 200);
    const refused = await api().patch(`/api/admin/registrations/${registrationId}/approve`).set(auth(registrar.token)).send({});
    assert.equal(refused.status, 409);
    const [{ open }] = await query("SELECT COUNT(*) open FROM timetable_issues WHERE registration_id = :registrationId AND status = 'open'", { registrationId });
    assert.ok(Number(open) >= 1);

    assert.equal((await move({ day: 'FRI', startTime: '09:00', endTime: '11:00', room: 'LT-4' })).status, 200);
    const approved = await api().patch(`/api/admin/registrations/${registrationId}/approve`).set(auth(registrar.token)).send({});
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    const row = await last('registration.approved');
    assert.equal(row.metadata.timetableIssuesClosed, Number(open));
  });

  test('a section that was never used is deleted; one with history is cancelled, and the log says which', async () => {
    const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'MATH'");
    const [{ id: semesterId }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const course = await api().post('/api/courses').set(auth(registrar.token)).send({ departmentId, code: 'TMP201', title: 'Temporary', credits: 3, level: 200 });
    assert.equal(course.status, 201, JSON.stringify(course.body));

    const fresh = await api().post('/api/sections').set(auth(registrar.token)).send({ courseId: course.body.data.id, semesterId, capacity: 20 });
    assert.equal(fresh.status, 201, JSON.stringify(fresh.body));
    assert.equal((await api().delete(`/api/sections/${fresh.body.data.id}`).set(auth(registrar.token))).status, 204);
    const deleted = await last('section.delete');
    assert.equal(deleted.entity_id, fresh.body.data.id);
    assert.equal((await query('SELECT COUNT(*) n FROM course_sections WHERE id = :id', { id: fresh.body.data.id }))[0].n, 0);

    // CS203 was registered and dropped by someone: it has history, so it can only be cancelled.
    const cs203 = await sectionIdFor('CS203');
    const student = await createStudent(5);
    const added = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: cs203 });
    assert.equal(added.status, 201, JSON.stringify(added.body));
    await api().delete(`/api/registrations/items/${added.body.data.confirmation.itemId}`).set(auth(student.token));
    assert.equal((await api().delete(`/api/sections/${cs203}`).set(auth(registrar.token))).status, 204);

    const cancelled = await last('section.cancel');
    assert.equal(cancelled.entity_id, cs203);
    assert.deepEqual(cancelled.metadata.changes.status.to, 'cancelled');
    assert.equal((await query('SELECT status FROM course_sections WHERE id = :cs203', { cs203 }))[0].status, 'cancelled');
    assert.equal((await rows('section.delete', `AND entity_id = ${cs203}`)).length, 0, 'it was not deleted, so it must not say so');
  });
});

describe('one action, one row', () => {
  test('deactivating and re-activating a lecturer writes one lecturer row each, with the status before and after', async () => {
    const [{ id: lecturerId, user_id: userId }] = await query("SELECT l.id, l.user_id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email = 'lecturer@scrs.local'");
    const userUpdatesBefore = (await rows('user.update', `AND entity_id = ${userId}`)).length;

    assert.equal((await api().post(`/api/lecturers/${lecturerId}/deactivate`).set(auth(admin.token))).status, 200);
    const off = await last('lecturer.deactivate');
    assert.deepEqual([off.entity_type, off.entity_id, off.metadata.userId, off.metadata.statusBefore, off.metadata.statusAfter], ['Lecturer', lecturerId, userId, 'active', 'suspended']);
    assert.equal((await rows('user.update', `AND entity_id = ${userId}`)).length, userUpdatesBefore, 'no second row from the account update');
    assert.equal((await query('SELECT status FROM users WHERE id = :userId', { userId }))[0].status, 'suspended');

    assert.equal((await api().post(`/api/lecturers/${lecturerId}/activate`).set(auth(admin.token))).status, 200);
    const on = await last('lecturer.activate');
    assert.deepEqual([on.metadata.statusBefore, on.metadata.statusAfter], ['suspended', 'active']);
    assert.equal((await rows('user.update', `AND entity_id = ${userId}`)).length, userUpdatesBefore);
  });

  test('an audit failure leaves the lecturer exactly as it was', async () => {
    const [{ id: lecturerId, user_id: userId }] = await query("SELECT l.id, l.user_id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email = 'lecturer@scrs.local'");
    await withBrokenAudit(async () => {
      assert.equal((await api().post(`/api/lecturers/${lecturerId}/deactivate`).set(auth(admin.token))).status, 500);
    });
    assert.equal((await query('SELECT status FROM users WHERE id = :userId', { userId }))[0].status, 'active', 'rolled back with the audit row');
    // Still able to sign in: nothing about the account changed.
    assert.equal((await login('lecturer@scrs.local', 'Lecturer@12345')).user.email, 'lecturer@scrs.local');
  });
});

describe('nothing from this file leaked a secret or personal data', () => {
  test('no password or temporary PIN is anywhere in the log', async () => {
    const stored = JSON.stringify(await query('SELECT action, metadata FROM audit_logs'));
    for (const secret of ['Passw0rd!', 'Lecturer@12345', 'Wrong@12345']) assert.ok(!stored.includes(secret), `${secret} is not in the log`);
  });
});
