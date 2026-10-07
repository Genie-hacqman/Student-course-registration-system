import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, sequelize,
} from './helpers.js';

let student;
let lecturer;
let registrar;
let admin;
let otherLecturer;
let studentId;
let cs201;

before(async () => {
  resetDatabase();
  [student, lecturer, registrar, admin] = await Promise.all(['student', 'lecturer', 'registrar', 'admin'].map((w) => loginAs(w)));
  studentId = (await query("SELECT id FROM students WHERE student_number = 'STU2025001'"))[0].id;
  cs201 = await sectionIdFor('CS201');

  for (const code of ['CS201', 'CS203']) {
    const res = await api().post('/api/registrations/items').set(auth(student.token)).send({ courseSectionId: await sectionIdFor(code) });
    assert.equal(res.status, 201);
  }
  const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
  await api().patch(`/api/admin/registrations/${submitted.body.data.id}/approve`).set(auth(registrar.token)).send({});

  const user = await api().post('/api/users').set(auth(admin.token)).send({
    firstName: 'Other', lastName: 'Lecturer', email: 'other.teacher@test.local', password: 'Passw0rd!', role: 'LECTURER',
  });
  const [{ id: departmentId }] = await query("SELECT id FROM departments WHERE code = 'CS'");
  await api().post('/api/lecturers').set(auth(admin.token)).send({ userId: user.body.data.id, departmentId, staffNumber: 'STF8888' });
  otherLecturer = await login('other.teacher@test.local', 'Passw0rd!');
});
after(() => sequelize.close());

const as = (who) => auth(who.token);
const notificationsOf = async (who, type) =>
  (await api().get('/api/notifications?limit=100').set(as(who))).body.data.filter((n) => n.type === type);

describe('attendance', () => {
  test('the section lecturer records a class; the student sees their rate', async () => {
    const created = await api().post(`/api/sections/${cs201}/attendance`).set(as(lecturer))
      .send({ date: '2026-01-05', topic: 'Introduction', records: [{ studentId, status: 'absent' }] });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.students.find((s) => s.studentId === studentId).status, 'absent');
    const sessionId = created.body.data.id;

    const again = await api().post(`/api/sections/${cs201}/attendance`).set(as(lecturer)).send({ date: '2026-01-05' });
    assert.equal(again.status, 409, 'one register per class meeting');

    const list = await api().get(`/api/sections/${cs201}/attendance`).set(as(lecturer));
    assert.equal(list.body.data.sessions.length, 1);
    assert.equal(list.body.data.students.find((s) => s.studentId === studentId).rate, 0);

    const updated = await api().put(`/api/attendance/${sessionId}`).set(as(lecturer)).send({ records: [{ studentId, status: 'late' }] });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.students.find((s) => s.studentId === studentId).status, 'late');
    assert.equal((await api().get(`/api/attendance/${sessionId}`).set(as(registrar))).status, 200, 'registrar can oversee');

    const mine = await api().get('/api/students/me/attendance').set(as(student));
    const cs = mine.body.data.find((s) => s.section.id === cs201);
    assert.equal(cs.sessions, 1);
    assert.equal(cs.rate, 100, 'late counts as attended');

    assert.equal((await api().delete(`/api/attendance/${sessionId}`).set(as(lecturer))).status, 204);
  });

  test('only the section lecturer (or oversight roles) may take attendance', async () => {
    assert.equal((await api().get(`/api/sections/${cs201}/attendance`).set(as(otherLecturer))).status, 403);
    assert.equal((await api().get(`/api/sections/${cs201}/attendance`).set(as(student))).status, 403);
    const outsider = await api().post(`/api/sections/${cs201}/attendance`).set(as(lecturer))
      .send({ date: '2026-01-06', records: [{ studentId: 99999, status: 'present' }] });
    assert.equal(outsider.status, 400);
    const bad = await api().post(`/api/sections/${cs201}/attendance`).set(as(lecturer)).send({ date: 'yesterday' });
    assert.equal(bad.status, 422);
  });
});

describe('assessments', () => {
  test('create, score, publish; students see only published work with their own score', async () => {
    const list = await api().get(`/api/sections/${cs201}/assessments`).set(as(lecturer));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.totalWeight, 25, 'two seeded assessments');

    const tooHeavy = await api().post(`/api/sections/${cs201}/assessments`).set(as(lecturer))
      .send({ title: 'Final exam', type: 'exam', maxScore: 100, weight: 80 });
    assert.equal(tooHeavy.status, 422, 'weights may not exceed 100%');

    const created = await api().post(`/api/sections/${cs201}/assessments`).set(as(lecturer))
      .send({ title: 'Midterm', type: 'midterm', maxScore: 50, weight: 30, dueAt: '2026-01-01T09:00:00Z' });
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'draft');
    const id = created.body.data.id;

    const over = await api().put(`/api/assessments/${id}/scores`).set(as(lecturer)).send({ scores: [{ studentId, score: 60 }] });
    assert.equal(over.status, 422);
    const scored = await api().put(`/api/assessments/${id}/scores`).set(as(lecturer)).send({ scores: [{ studentId, score: 45, feedback: 'Good' }] });
    assert.equal(scored.status, 200);
    assert.equal(scored.body.data.students.find((s) => s.studentId === studentId).score, 45);
    assert.equal((await api().get(`/api/assessments/${id}/scores`).set(as(lecturer))).status, 200);

    const shrink = await api().patch(`/api/assessments/${id}`).set(as(lecturer)).send({ maxScore: 40 });
    assert.equal(shrink.status, 422, 'max score below an existing score');
    assert.equal((await api().patch(`/api/assessments/${id}`).set(as(otherLecturer)).send({ title: 'Nope' })).status, 403);

    assert.equal((await api().post(`/api/assessments/${id}/publish`).set(as(lecturer))).status, 200);
    assert.equal((await api().post(`/api/assessments/${id}/publish`).set(as(lecturer))).status, 409);
    assert.ok((await notificationsOf(student, 'ASSESSMENT_PUBLISHED')).length >= 1);

    const mine = await api().get('/api/students/me/assessments').set(as(student));
    const titles = mine.body.data.find((s) => s.section.id === cs201).assessments.map((a) => a.title);
    assert.ok(titles.includes('Midterm'));
    assert.ok(!titles.includes('Assignment 1: Stack implementation'), 'drafts stay hidden');
    assert.equal(mine.body.data.find((s) => s.section.id === cs201).assessments.find((a) => a.title === 'Midterm').score, 45);

    assert.equal((await api().delete(`/api/assessments/${id}`).set(as(lecturer))).status, 204);
    assert.equal((await api().get(`/api/sections/${cs201}/assessments`).set(as(student))).status, 403);
  });
});

describe('lecturer tasks', () => {
  test('derived from real data; lecturers only', async () => {
    const res = await api().get('/api/lecturers/me/tasks').set(as(lecturer));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.some((t) => t.type === 'publish_assessment'), 'the seeded draft assessment needs publishing');
    assert.equal((await api().get('/api/lecturers/me/tasks').set(as(student))).status, 403);
  });
});

describe('announcements', () => {
  test('lecturers post to their own sections; the right people see each post', async () => {
    const wide = await api().post('/api/announcements').set(as(lecturer)).send({ title: 'Hello all', body: 'x', audience: 'everyone' });
    assert.equal(wide.status, 403);
    const foreign = await api().post('/api/announcements').set(as(otherLecturer))
      .send({ title: 'Not mine', body: 'x', audience: 'section', courseSectionId: cs201 });
    assert.equal(foreign.status, 403);
    const missing = await api().post('/api/announcements').set(as(lecturer)).send({ title: 'Oops', body: 'x', audience: 'section' });
    assert.equal(missing.status, 422);

    const section = await api().post('/api/announcements').set(as(lecturer))
      .send({ title: 'Room change', body: 'Thursday class moves to LT2.', audience: 'section', courseSectionId: cs201 });
    assert.equal(section.status, 201);
    assert.equal(section.body.data.recipientCount, 1);
    assert.ok((await notificationsOf(student, 'ANNOUNCEMENT')).some((n) => n.title === 'Room change'));

    const students = await api().post('/api/announcements').set(as(registrar))
      .send({ title: 'Exam timetable published', body: 'See the portal.', audience: 'all_students', pinned: true });
    assert.equal(students.status, 201);
    assert.ok(students.body.data.recipientCount >= 1);

    const feed = (await api().get('/api/announcements').set(as(student))).body.data.map((a) => a.title);
    assert.ok(feed.includes('Room change') && feed.includes('Exam timetable published') && feed.includes('Course registration is open'));
    const lecturerFeed = (await api().get('/api/announcements').set(as(lecturer))).body.data.map((a) => a.title);
    assert.ok(!lecturerFeed.includes('Exam timetable published'), 'students-only posts stay with students');
    assert.equal((await api().post('/api/announcements').set(as(student)).send({ title: 'Hi', body: 'x', audience: 'everyone' })).status, 403);

    const mine = await api().get('/api/announcements/mine').set(as(lecturer));
    assert.ok(mine.body.data.some((a) => a.title === 'Room change'));

    const id = section.body.data.id;
    assert.equal((await api().patch(`/api/announcements/${id}`).set(as(otherLecturer)).send({ pinned: true })).status, 403);
    const moderated = await api().patch(`/api/announcements/${id}`).set(as(registrar)).send({ pinned: true });
    assert.equal(moderated.body.data.pinned, true);
    assert.equal((await api().delete(`/api/announcements/${id}`).set(as(lecturer))).status, 204);
  });
});
