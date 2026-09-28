import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sequelize,
} from './helpers.js';
import { hashToken } from '../../src/utils/jwt.js';

let admin;
let lecturer;

before(async () => {
  resetDatabase();
  [admin, lecturer] = await Promise.all([loginAs('admin'), loginAs('lecturer')]);
});
after(() => sequelize.close());

const post = (path, body, who = admin) => api().post(`/api/admin/import/${path}`).set(auth(who.token)).send(body);
const count = async (sql, replacements) => Number((await query(sql, replacements))[0].n);

// A small but complete institution, in dependency order. Codes avoid the demo seed's.
const files = {
  departments: [{ code: 'eng', name: 'Engineering' }],
  programs: [{ code: 'BENG', name: 'BEng Engineering', departmentCode: 'ENG', maxCredits: 21 }],
  courses: [
    { code: 'eng101', title: 'Engineering Basics', departmentCode: 'ENG', credits: 3, level: 100 },
    { code: 'ENG102', title: 'Statics', departmentCode: 'ENG', credits: 3, level: 100 },
    { code: 'ENG201', title: 'Dynamics', departmentCode: 'ENG', credits: 3, level: 200 },
  ],
  'program-courses': [
    { programCode: 'BENG', courseCode: 'ENG101' },
    { programCode: 'BENG', courseCode: 'ENG102', type: 'elective' },
    { programCode: 'BENG', courseCode: 'ENG201' },
  ],
  prerequisites: [{ courseCode: 'ENG201', requiresAnyOf: ['ENG101', 'ENG102'], minGrade: 'C' }],
  lecturers: [
    { email: 'Ada.Eng@test.local', firstName: 'Ada', lastName: 'Lovelace', staffNumber: 'ENG-001', departmentCode: 'ENG', title: 'Dr' },
    { email: 'grace.eng@test.local', firstName: 'Grace', lastName: 'Hopper', staffNumber: 'ENG-002', departmentCode: 'ENG' },
  ],
  sections: [
    {
      courseCode: 'ENG101', capacity: 30, lecturerStaffNumber: 'ENG-001',
      schedules: [{ day: 'MON', startTime: '07:00', endTime: '08:00', room: 'IMP-1' }],
    },
    {
      courseCode: 'ENG102', capacity: 30, lecturerStaffNumber: 'ENG-001',
      schedules: [{ day: 'TUE', startTime: '07:00', endTime: '08:00', room: 'IMP-1' }],
    },
  ],
};

describe('bulk import', () => {
  test('requires the matching permission', async () => {
    assert.equal((await post('departments', { rows: files.departments }, lecturer)).status, 403);
    assert.equal((await post('lecturers', { rows: files.lecturers }, lecturer)).status, 403);
  });

  test('a dry run reports what would happen and leaves the database unchanged', async () => {
    const res = await post('departments', { rows: files.departments, dryRun: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.dryRun, true);
    assert.equal(res.body.data.created, 1);
    assert.equal(await count("SELECT COUNT(*) n FROM departments WHERE code = 'ENG'"), 0);
  });

  test('a dry run sees earlier rows of the same file (same-file clashes are caught)', async () => {
    const res = await post('sections', {
      dryRun: true,
      rows: [
        { courseCode: 'CS101', sectionCode: 'Z1', capacity: 5, schedules: [{ day: 'SUN', startTime: '06:00', endTime: '07:00', room: 'DRY-1' }] },
        { courseCode: 'CS101', sectionCode: 'Z2', capacity: 5, schedules: [{ day: 'SUN', startTime: '06:30', endTime: '07:30', room: 'DRY-1' }] },
      ],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.created, 1);
    assert.equal(res.body.data.errors[0].row, 1);
    assert.match(res.body.data.errors[0].message, /conflict/i);
    assert.equal(await count("SELECT COUNT(*) n FROM schedules WHERE room = 'DRY-1'"), 0);
  });

  test('a full institution imports in dependency order', async () => {
    for (const [path, rows] of Object.entries(files)) {
      const res = await post(path, { rows });
      assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
      assert.deepEqual(res.body.data.errors, [], path);
      assert.equal(res.body.data.created, rows.length, path);
    }
    const [program] = await query("SELECT max_credits, duration_years FROM programs WHERE code = 'BENG'");
    assert.deepEqual(program, { max_credits: 21, duration_years: 4 }); // omitted durationYears gets the default
    assert.equal(await count("SELECT COUNT(*) n FROM course_prerequisites p JOIN courses c ON c.id = p.course_id WHERE c.code = 'ENG201' AND p.group_no = 1"), 2);
    const [ada] = await query("SELECT l.staff_number, u.password_hash FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.email = 'ada.eng@test.local'");
    assert.deepEqual(ada, { staff_number: 'ENG-001', password_hash: '!invite-pending' });
  });

  test('re-importing the same files changes nothing and creates no duplicates', async () => {
    for (const [path, rows] of Object.entries(files)) {
      const res = await post(path, { rows });
      assert.equal(res.status, 200, path);
      assert.equal(res.body.data.created, 0, path);
      assert.equal(res.body.data.unchanged, rows.length, `${path}: ${JSON.stringify(res.body.data)}`);
    }
    assert.equal(await count("SELECT COUNT(*) n FROM users WHERE email LIKE '%.eng@test.local'"), 2);
  });

  test('a corrected row updates the record; omitted fields are left alone', async () => {
    const res = await post('programs', { rows: [{ code: 'BENG', name: 'BEng Engineering (Hons)', departmentCode: 'ENG' }] });
    assert.equal(res.body.data.updated, 1);
    const [program] = await query("SELECT name, max_credits FROM programs WHERE code = 'BENG'");
    assert.deepEqual(program, { name: 'BEng Engineering (Hons)', max_credits: 21 });
  });

  test('bad rows are reported while the good rows still import', async () => {
    const res = await post('lecturers', {
      rows: [
        { email: 'good.eng@test.local', firstName: 'Good', lastName: 'Row', staffNumber: 'ENG-003', departmentCode: 'ENG' },
        { email: 'bad.dept@test.local', firstName: 'Bad', lastName: 'Department', staffNumber: 'ENG-004', departmentCode: 'NOPE' },
        { email: 'student@scrs.local', firstName: 'Wrong', lastName: 'Role', staffNumber: 'ENG-005', departmentCode: 'ENG' },
        { email: 'dup.number@test.local', firstName: 'Dup', lastName: 'Number', staffNumber: 'ENG-001', departmentCode: 'ENG' },
      ],
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.created, 1);
    assert.deepEqual(res.body.data.errors.map((e) => e.row), [1, 2, 3]);
    assert.match(res.body.data.errors[0].message, /Unknown department code NOPE/);
    assert.match(res.body.data.errors[1].message, /already belongs to a USER account/);
    assert.match(res.body.data.errors[2].message, /Duplicate value/);
    // The failed lecturer profile left no orphan account behind.
    assert.equal(await count("SELECT COUNT(*) n FROM users WHERE email = 'dup.number@test.local'"), 0);
  });

  test('a section cannot shrink below the seats already taken', async () => {
    await query("UPDATE course_sections s JOIN courses c ON c.id = s.course_id SET s.seats_taken = 10 WHERE c.code = 'ENG102'");
    const res = await post('sections', { rows: [{ courseCode: 'ENG102', capacity: 5 }] });
    assert.match(res.body.data.errors[0].message, /below the 10 seats/);
    await query("UPDATE course_sections s JOIN courses c ON c.id = s.course_id SET s.seats_taken = 0 WHERE c.code = 'ENG102'");
  });

  test('a prerequisite that contradicts an existing group is rejected, not merged', async () => {
    const res = await post('prerequisites', { rows: [{ courseCode: 'ENG201', requiresAnyOf: ['ENG101'] }] });
    assert.equal(res.body.data.failed, 1);
    assert.match(res.body.data.errors[0].message, /different requirement/);
  });

  test('rows are validated before anything runs', async () => {
    const res = await post('courses', { rows: [{ code: 'BAD CODE', title: 'x', departmentCode: 'ENG', credits: 3, level: 100 }] });
    assert.equal(res.status, 422);
  });
});

describe('invites', () => {
  test('imported accounts cannot sign in until they set a password', async () => {
    const res = await api().post('/api/auth/login').send({ identifier: 'ada.eng@test.local', password: '!invite-pending' });
    assert.equal(res.status, 401);
  });

  test('pending invites are sent in batches and not re-sent while unexpired', async () => {
    const first = await post('invites', { role: 'LECTURER', limit: 2 });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.data, { sent: 2, remaining: 1 });
    assert.deepEqual((await post('invites', { role: 'LECTURER' })).body.data, { sent: 1, remaining: 0 });
    assert.deepEqual((await post('invites', {})).body.data, { sent: 0, remaining: 0 });

    const [{ hours }] = await query(
      "SELECT TIMESTAMPDIFF(HOUR, NOW(), password_reset_expires) AS hours FROM users WHERE email = 'ada.eng@test.local'",
    );
    assert.ok(hours >= 71 && hours <= 72, `invite should last 72h, got ${hours}`);
  });

  test('an imported lecturer sets a password from the invite and signs in', async () => {
    const raw = 'planted-invite-token-'.padEnd(48, 'x');
    await query("UPDATE users SET password_reset_hash = :hash WHERE email = 'ada.eng@test.local'", { hash: hashToken(raw) });
    const reset = await api().post('/api/auth/reset-password').send({ token: raw, password: 'Imported@12345' });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));

    const ada = await login('ada.eng@test.local', 'Imported@12345');
    // Having set a password, they drop out of the pending-invite pool.
    assert.equal((await api().post(`/api/users/${ada.user.id}/invite`).set(auth(admin.token))).status, 409);
  });

  test('a student admitted into an imported programme registers for an imported section', async () => {
    const admitted = await api().post('/api/admissions/bulk').set(auth(admin.token)).send({
      rows: [{ firstName: 'Imani', lastName: 'One', programCode: 'BENG', admissionSession: '2026/2027', admissionNumber: 'ENG-ADM-1' }],
    });
    const [{ studentNumber, pin }] = admitted.body.data.credentials;
    const first = await login(studentNumber, pin);
    const changed = await api().patch('/api/auth/pin').set(auth(first.token)).send({ currentPin: pin, newPin: '306814', confirmPin: '306814' });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));

    const [{ id: sectionId }] = await query(
      "SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE c.code = 'ENG101'",
    );
    const add = await api().post('/api/registrations/items').set(auth(changed.body.data.accessToken)).send({ courseSectionId: sectionId });
    assert.equal(add.status, 201, JSON.stringify(add.body));
  });

  test('staff can create a user without a password; they get an invite instead', async () => {
    const created = await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'No', lastName: 'Password', email: 'nopassword@test.local', role: 'REGISTRAR',
    });
    assert.equal(created.status, 201);
    const [row] = await query("SELECT password_reset_hash FROM users WHERE email = 'nopassword@test.local'");
    assert.ok(row.password_reset_hash, 'an invite token was issued');
    const resend = await api().post(`/api/users/${created.body.data.id}/invite`).set(auth(admin.token));
    assert.equal(resend.status, 204);
  });
});
