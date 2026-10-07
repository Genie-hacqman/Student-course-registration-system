import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, createStudent, sequelize,
} from './helpers.js';
import { hashToken } from '../../src/utils/jwt.js';

let admin;
let registrar;
let student;
let demoLecturer;
const dept = {};

const createLecturer = (body, who = admin) => api().post('/api/lecturers').set(auth(who.token)).send(body);
const assign = (sectionId, lecturerId, who = registrar, reason) =>
  api().put(`/api/sections/${sectionId}/lecturer`).set(auth(who.token)).send({ lecturerId, ...(reason ? { reason } : {}) });
const setSetting = (key, value) => query(
  'INSERT INTO settings (`key`, value, created_at, updated_at) VALUES (:key, :value, NOW(), NOW()) ON DUPLICATE KEY UPDATE value = :value',
  { key, value: JSON.stringify(value) },
);
const PASSWORD = 'Lecturer1pass';

const activate = async (email) => {
  const [{ hash }] = await query('SELECT password_reset_hash AS hash FROM users WHERE email = :email', { email });
  assert.ok(hash, 'creating the lecturer issued an activation (set-your-password) link');
  const raw = `planted-invite-${email}-`.padEnd(48, 'x');
  await query('UPDATE users SET password_reset_hash = :hash WHERE email = :email', { hash: hashToken(raw), email });
  const res = await api().post('/api/auth/reset-password').send({ token: raw, password: PASSWORD });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return login(email, PASSWORD);
};

let n = 0;
const newLecturer = async (overrides = {}) => {
  n += 1;
  const res = await createLecturer({
    firstName: 'Test', lastName: `Lecturer${n}`, staffNumber: `STF-T${n}`, departmentId: dept.CS,
    schoolEmail: `lecturer${n}@staff.scrs.edu`, ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};

before(async () => {
  resetDatabase();
  [admin, registrar, student, demoLecturer] = await Promise.all(['admin', 'registrar', 'student', 'lecturer'].map((w) => loginAs(w)));
  for (const { id, code } of await query('SELECT id, code FROM departments')) dept[code] = id;
});
after(() => sequelize.close());

describe('lecturer accounts (ADMIN)', () => {
  test('admin creates a lecturer: account + profile together, activation link issued, no secrets returned', async () => {
    const res = await createLecturer({
      firstName: 'Kwame', lastName: 'Mensah', title: 'Dr.', staffNumber: 'STF-9001', departmentId: dept.CS,
      schoolEmail: 'Kwame.Mensah@staff.scrs.edu', personalEmail: 'kwame.mensah@gmail.com', phone: '+233 24 555 0101', specialization: 'Distributed systems',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const l = res.body.data;
    assert.equal(l.user.email, 'kwame.mensah@staff.scrs.edu');
    assert.equal(l.personalEmail, 'kwame.mensah@gmail.com');
    assert.equal(l.specialization, 'Distributed systems');
    assert.equal(l.department.code, 'CS');
    assert.equal(Boolean(Number(l.invitePending)), true, 'not activated yet');
    assert.doesNotMatch(JSON.stringify(res.body), /token|password/i);

    const [row] = await query(
      "SELECT r.name AS role, u.status, u.password_hash FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = 'kwame.mensah@staff.scrs.edu'",
    );
    assert.equal(row.role, 'LECTURER');
    assert.equal(row.status, 'active');
    assert.equal(row.password_hash, '!invite-pending', 'no usable password until the lecturer sets one');
    const [audit] = await query("SELECT user_id FROM audit_logs WHERE action = 'lecturer.create' ORDER BY id DESC LIMIT 1");
    assert.equal(audit.user_id, admin.user.id);
  });

  test('the school email is generated from the staff domain when not given, and never reused', async () => {
    assert.equal((await createLecturer({ firstName: 'No', lastName: 'Email', staffNumber: 'STF-9002', departmentId: dept.CS })).status, 400);
    await setSetting('institution.staffEmailDomain', 'staff.scrs.edu');
    const a = await createLecturer({ firstName: 'Ama', lastName: 'Boateng', staffNumber: 'STF-9003', departmentId: dept.MATH });
    const b = await createLecturer({ firstName: 'Ama', lastName: 'Boateng', staffNumber: 'STF-9004', departmentId: dept.MATH });
    assert.equal(a.body.data.user.email, 'ama.boateng@staff.scrs.edu');
    assert.equal(b.body.data.user.email, 'ama.boateng2@staff.scrs.edu');
  });

  test('duplicate staff ID, school email or personal email is rejected and creates nothing', async () => {
    const before = Number((await query('SELECT COUNT(*) AS n FROM users'))[0].n);
    const base = { firstName: 'Dup', lastName: 'Person', departmentId: dept.CS };
    const staff = await createLecturer({ ...base, staffNumber: 'STF-9001', schoolEmail: 'dup1@staff.scrs.edu' });
    assert.equal(staff.status, 409);
    assert.match(staff.body.error.message, /Staff ID STF-9001 is already used/);
    const school = await createLecturer({ ...base, staffNumber: 'STF-9101', schoolEmail: 'kwame.mensah@staff.scrs.edu' });
    assert.equal(school.status, 409);
    assert.match(school.body.error.message, /School email .* already used/);
    const personal = await createLecturer({ ...base, staffNumber: 'STF-9102', schoolEmail: 'dup3@staff.scrs.edu', personalEmail: 'KWAME.MENSAH@gmail.com' });
    assert.equal(personal.status, 409);
    assert.equal(Number((await query('SELECT COUNT(*) AS n FROM users'))[0].n), before);
  });

  test('only admins manage lecturers; the registry can view them', async () => {
    const body = { firstName: 'X', lastName: 'Y', staffNumber: 'STF-9200', departmentId: dept.CS, schoolEmail: 'xy@staff.scrs.edu' };
    for (const who of [registrar, student, demoLecturer]) assert.equal((await createLecturer(body, who)).status, 403);
    assert.equal((await api().get('/api/lecturers?search=Mensah').set(auth(registrar.token))).body.data.length, 1);
    assert.equal((await api().get('/api/lecturers').set(auth(student.token))).status, 403);
  });

  test('search and filter by department and status', async () => {
    const byDept = await api().get(`/api/lecturers?departmentId=${dept.MATH}`).set(auth(admin.token));
    assert.ok(byDept.body.data.every((l) => l.department.code === 'MATH'));
    const byStaff = await api().get('/api/lecturers?search=STF-9001').set(auth(admin.token));
    assert.deepEqual(byStaff.body.data.map((l) => l.staffNumber), ['STF-9001']);
  });

  test('activation: the lecturer sets a password via the emailed link and reaches only lecturer features', async () => {
    const session = await activate('kwame.mensah@staff.scrs.edu');
    assert.equal(session.user.role.name, 'LECTURER');
    const [{ id: sectionId }] = await query('SELECT id FROM course_sections LIMIT 1');
    const me = session.user.lecturer.id;
    assert.equal((await api().post('/api/users').set(auth(session.token)).send({ firstName: 'a', lastName: 'b', email: 'z@z.z', role: 'STUDENT' })).status, 403);
    assert.equal((await api().post('/api/admissions').set(auth(session.token)).send({})).status, 403);
    assert.equal((await api().patch('/api/admin/registrations/1/approve').set(auth(session.token)).send({})).status, 403);
    assert.equal((await assign(sectionId, me, session)).status, 403, 'cannot assign themselves');
    assert.equal((await api().patch(`/api/sections/${sectionId}`).set(auth(session.token)).send({ lecturerId: me })).status, 403);
  });

  test('deactivating ends sessions and blocks sign-in; activating restores it', async () => {
    const session = await login('kwame.mensah@staff.scrs.edu', PASSWORD);
    const [{ id }] = await query("SELECT l.id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email = 'kwame.mensah@staff.scrs.edu'");
    assert.equal((await api().post(`/api/lecturers/${id}/deactivate`).set(auth(admin.token))).status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(session.token))).status, 401, 'session ended');
    assert.equal((await api().post('/api/auth/login').send({ identifier: 'kwame.mensah@staff.scrs.edu', password: PASSWORD })).status, 403);
    assert.ok(Number((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'lecturer.deactivate'"))[0].n) >= 1);

    assert.equal((await api().post(`/api/lecturers/${id}/activate`).set(auth(admin.token))).status, 200);
    assert.equal((await api().post('/api/auth/login').send({ identifier: 'kwame.mensah@staff.scrs.edu', password: PASSWORD })).status, 200);
  });
});

describe('course-offering assignment (REGISTRAR)', () => {
  let math201;
  let mathA;
  let mathB;

  before(async () => {
    math201 = await sectionIdFor('MATH201');
    mathA = await newLecturer({ departmentId: dept.MATH });
    mathB = await newLecturer({ departmentId: dept.MATH });
  });

  test('the registrar assigns: current lecturer, active history row and audit entry', async () => {
    const res = await assign(math201, mathA.id, registrar, 'Timetable planning');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.section.lecturerId, mathA.id);
    assert.equal(res.body.data.assignments.length, 1);
    const [row] = res.body.data.assignments;
    assert.deepEqual([row.status, row.lecturer.id, row.assigner.id], ['active', mathA.id, registrar.user.id]);
    const [a] = await query("SELECT user_id, metadata FROM audit_logs WHERE action = 'lecturer.assign' ORDER BY id DESC LIMIT 1");
    assert.equal(a.user_id, registrar.user.id);
    assert.equal(JSON.parse(JSON.stringify(a.metadata)).course ?? a.metadata.course, 'MATH201');
  });

  test('assigning the same lecturer again is rejected', async () => {
    const res = await assign(math201, mathA.id);
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /already assigned/);
  });

  test('changing the lecturer ends the previous assignment; the history keeps both', async () => {
    const res = await assign(math201, mathB.id, registrar, 'Staff change');
    assert.equal(res.status, 200);
    const [latest, previous] = res.body.data.assignments;
    assert.deepEqual([latest.lecturer.id, latest.status], [mathB.id, 'active']);
    assert.deepEqual([previous.lecturer.id, previous.status, previous.endReason], [mathA.id, 'ended', 'Staff change']);
    assert.equal(previous.ender.id, registrar.user.id);
    assert.ok(Number((await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'lecturer.reassign'"))[0].n) >= 1);
    assert.equal(Number((await query("SELECT COUNT(*) AS n FROM courses WHERE code = 'MATH201'"))[0].n), 1);
  });

  test('students, lecturers and admins cannot assign; section edits carrying a lecturer need lecturer:assign too', async () => {
    assert.equal((await assign(math201, mathA.id, student)).status, 403);
    assert.equal((await assign(math201, mathA.id, demoLecturer)).status, 403);
    assert.equal((await assign(math201, mathA.id, admin)).status, 403);
    assert.equal((await api().patch(`/api/sections/${math201}`).set(auth(admin.token)).send({ lecturerId: mathA.id })).status, 403);
    assert.equal((await api().patch(`/api/sections/${math201}`).set(auth(admin.token)).send({ capacity: 60 })).status, 403);
    assert.equal((await api().patch(`/api/sections/${math201}`).set(auth(registrar.token)).send({ capacity: 60 })).status, 200);
  });

  test('an inactive lecturer cannot be assigned', async () => {
    const inactive = await newLecturer({ departmentId: dept.MATH });
    await api().post(`/api/lecturers/${inactive.id}/deactivate`).set(auth(admin.token));
    const res = await assign(math201, inactive.id);
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /not active/);
  });

  test('a lecturer from another department is rejected while the restriction is on', async () => {
    const cs = await newLecturer({ departmentId: dept.CS });
    const res = await assign(math201, cs.id);
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /MATH201 belongs to Mathematics/);

    await setSetting('teaching.restrictLecturerDepartment', false);
    assert.equal((await assign(math201, cs.id)).status, 200, 'allowed once the institution turns the restriction off');
    await setSetting('teaching.restrictLecturerDepartment', true);
    assert.equal((await assign(math201, mathB.id)).status, 200);
  });

  test('archived courses and completed semesters cannot get a lecturer', async () => {
    const [{ id: previousSemester }] = await query("SELECT id FROM semesters WHERE status = 'completed' LIMIT 1");
    const [{ id: math201Course }] = await query("SELECT id FROM courses WHERE code = 'MATH201'");
    const old = await api().post('/api/sections').set(auth(registrar.token)).send({ courseId: math201Course, semesterId: previousSemester, capacity: 10, sectionCode: 'Z' });
    assert.equal(old.status, 201);
    const completed = await assign(old.body.data.id, mathA.id);
    assert.equal(completed.status, 400);
    assert.match(completed.body.error.message, /completed/);

    const course = await api().post('/api/courses').set(auth(registrar.token)).send({ code: 'MATH290', title: 'Topics', departmentId: dept.MATH, credits: 3, level: 200 });
    const [{ id: current }] = await query('SELECT id FROM semesters WHERE is_current = 1');
    const section = await api().post('/api/sections').set(auth(registrar.token)).send({ courseId: course.body.data.id, semesterId: current, capacity: 10 });
    await api().delete(`/api/courses/${course.body.data.id}`).set(auth(registrar.token));
    const archived = await assign(section.body.data.id, mathA.id);
    assert.equal(archived.status, 400);
    assert.match(archived.body.error.message, /archived/);
  });

  test('a timetable clash is detected and shown, not saved', async () => {
    const [{ id: demoLecturerId }] = await query("SELECT l.id FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email = 'lecturer@scrs.local'");
    const cs204 = await sectionIdFor('CS204');
    const res = await assign(cs204, demoLecturerId);
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /already teaching at these times/);
    assert.ok(res.body.error.details.some((c) => c.course === 'CS203' && c.day === 'WED'));
    const [{ lecturer_id: still }] = await query('SELECT lecturer_id FROM course_sections WHERE id = :cs204', { cs204 });
    assert.equal(still, null, 'nothing was assigned');
  });

  test('removing an assignment ends it and clears the offering', async () => {
    const extra = await newLecturer({ departmentId: dept.CS });
    const cs204 = await sectionIdFor('CS204');
    assert.equal((await assign(cs204, extra.id)).status, 200);
    const res = await api().delete(`/api/sections/${cs204}/lecturer`).set(auth(registrar.token)).send({ reason: 'Course merged' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.section.lecturerId, null);
    assert.equal(res.body.data.assignments[0].status, 'ended');
    assert.equal((await api().delete(`/api/sections/${cs204}/lecturer`).set(auth(registrar.token)).send({})).status, 409);
  });

  test('offerings can be filtered to the unassigned ones of a department', async () => {
    const res = await api().get(`/api/sections?unassigned=true&departmentId=${dept.CS}`).set(auth(registrar.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.data.length >= 1);
    assert.ok(res.body.data.every((s) => s.lecturerId === null && s.course.departmentId === dept.CS));
  });
});

describe('what lecturers and students see', () => {
  test('a lecturer sees only their own offerings, with year, schedule and room', async () => {
    const [{ email }] = await query(
      "SELECT u.email FROM course_sections s JOIN courses c ON c.id = s.course_id JOIN lecturers l ON l.id = s.lecturer_id JOIN users u ON u.id = l.user_id WHERE c.code = 'MATH201' AND s.section_code = 'A'",
    );
    const session = await activate(email);
    const mine = (await api().get('/api/lecturers/me/sections').set(auth(session.token))).body.data;
    assert.deepEqual(mine.map((s) => s.course.code), ['MATH201']);
    assert.ok(mine[0].semester.academicYear.name);
    assert.deepEqual(mine[0].schedules.map((s) => [s.day, s.room]), [['FRI', 'LT-4']]);

    const demo = (await api().get('/api/lecturers/me/sections').set(auth(demoLecturer.token))).body.data;
    assert.ok(!demo.some((s) => s.course.code === 'MATH201'));
  });

  test('a student sees the lecturer assigned to their approved course', async () => {
    const me = await createStudent(1);
    for (const code of ['MATH201', 'CS201']) {
      const [{ id }] = await query(
        "SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id JOIN semesters m ON m.id = s.semester_id WHERE c.code = :code AND m.is_current = 1",
        { code },
      );
      const res = await api().post('/api/registrations/items').set(auth(me.token)).send({ courseSectionId: id });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    const submitted = await api().post('/api/registrations/submit').set(auth(me.token));
    assert.equal((await api().patch(`/api/admin/registrations/${submitted.body.data.id}/approve`).set(auth(registrar.token)).send({})).status, 200);

    const current = (await api().get('/api/registrations/current').set(auth(me.token))).body.data.registration;
    const math = current.items.find((i) => i.section.course.code === 'MATH201');
    const [{ first_name: firstName }] = await query(
      "SELECT u.first_name FROM course_sections s JOIN courses c ON c.id = s.course_id JOIN lecturers l ON l.id = s.lecturer_id JOIN users u ON u.id = l.user_id WHERE c.code = 'MATH201' AND s.section_code = 'A'",
    );
    assert.equal(current.status, 'approved');
    assert.equal(math.section.lecturer.user.firstName, firstName);
  });
});
