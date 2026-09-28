/**
 * Online admission, end to end: applicant sign-up → application → admin review → activation link →
 * student sign-in → eligible course catalogue → registration → registrar approval with timetable confirmation.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, login, auth, query, sectionIdFor, sequelize,
  createApplicant, completeApplication, submitApplication, plantActivationToken, APPLICANT_PASSWORD,
} from './helpers.js';
import { admissionEmail } from '../../src/services/application.service.js';

let admin;
let registrar;
let student;

before(async () => {
  resetDatabase();
  [admin, registrar, student] = await Promise.all(['admin', 'registrar', 'student'].map((who) => loginAs(who)));
});
after(() => sequelize.close());

const signUp = (body) => api().post('/api/applications/account').send(body);
const admit = (id, body = {}, who = admin) => api().post(`/api/applications/${id}/admit`).set(auth(who.token)).send(body);
const reject = (id, body = {}, who = admin) => api().post(`/api/applications/${id}/reject`).set(auth(who.token)).send(body);
const activate = (token, pin = '482915', confirmPin = pin) => api().post('/api/applications/activate').send({ token, pin, confirmPin });
const PIN = '482915';

describe('applicant sign-up', () => {
  test('creates an APPLICANT with a personal email; repeating the email answers the same and creates nothing', async () => {
    const body = { firstName: 'Kofi', lastName: 'Boateng', email: 'Kofi.Boateng@Personal.test', password: APPLICANT_PASSWORD };
    const first = await signUp(body);
    assert.equal(first.status, 202);
    const again = await signUp(body);
    assert.equal(again.status, 202);
    assert.deepEqual(again.body, first.body, 'no way to tell an existing account from a new one');

    const rows = await query("SELECT u.email, u.email_verified_at, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.email = 'kofi.boateng@personal.test'");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'APPLICANT');
    assert.equal(rows[0].email_verified_at, null, 'the personal email still has to be confirmed');
  });

  test('refuses a weak password', async () => {
    assert.equal((await signUp({ firstName: 'A', lastName: 'B', email: 'weak@personal.test', password: 'password' })).status, 422);
  });

  test('staff cannot create applicant accounts', async () => {
    const res = await api().post('/api/users').set(auth(admin.token))
      .send({ firstName: 'X', lastName: 'Y', email: 'staffmade@personal.test', password: 'Passw0rd!', role: 'APPLICANT' });
    assert.equal(res.status, 422);
  });
});

describe('application form', () => {
  test('lists departments with their programmes and admissible levels', async () => {
    const applicant = await createApplicant(1);
    const res = await api().get('/api/applications/options').set(auth(applicant.token));
    assert.equal(res.status, 200);
    const cs = res.body.data.find((d) => d.code === 'CS');
    const program = cs.programs.find((p) => p.code === 'BSC-CS');
    assert.deepEqual(program.levels, Array.from({ length: program.durationYears }, (_, i) => (i + 1) * 100));
  });

  test('a programme from another department, or a level beyond the programme, is refused', async () => {
    const applicant = await createApplicant(2);
    const [math] = await query("SELECT id FROM departments WHERE code = 'MATH'");
    const mismatch = await api().put('/api/applications/me').set(auth(applicant.token)).send(await completeApplication({ departmentId: math.id }));
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.body.error.message, /not offered by the chosen department/);

    const tooHigh = await api().put('/api/applications/me').set(auth(applicant.token)).send(await completeApplication({ entryLevel: 900 }));
    assert.equal(tooHigh.status, 400);
  });

  test('cannot submit before confirming the email, nor with fields missing', async () => {
    const unverified = await createApplicant(3, { verify: false });
    await api().put('/api/applications/me').set(auth(unverified.token)).send(await completeApplication());
    const early = await api().post('/api/applications/me/submit').set(auth(unverified.token));
    assert.equal(early.status, 400);
    assert.match(early.body.error.message, /Confirm your email/);

    const partial = await createApplicant(4);
    await api().put('/api/applications/me').set(auth(partial.token)).send({ phone: '+233 20 000 0000' });
    const missing = await api().post('/api/applications/me/submit').set(auth(partial.token));
    assert.equal(missing.status, 400);
    assert.ok(missing.body.error.details.missing.includes('programme'));
  });

  test('a submitted application is locked, and shows as pending to the applicant', async () => {
    const applicant = await createApplicant(5);
    const application = await submitApplication(applicant);
    assert.equal(application.status, 'submitted');
    assert.equal(application.personalEmail, applicant.email);

    const edit = await api().put('/api/applications/me').set(auth(applicant.token)).send({ phone: '+233 20 111 1111' });
    assert.equal(edit.status, 409);
    assert.equal((await api().post('/api/applications/me/submit').set(auth(applicant.token))).status, 409);
  });
});

describe('authorization', () => {
  test('an applicant cannot register courses, see the student area, or review applications', async () => {
    const applicant = await createApplicant(6);
    const application = await submitApplication(applicant);
    for (const [method, path] of [
      ['get', '/api/registrations/current'],
      ['get', '/api/registrations/available-courses'],
      ['post', '/api/registrations/submit'],
      ['get', '/api/applications'],
      ['get', `/api/applications/${application.id}`],
      ['post', `/api/applications/${application.id}/admit`],
    ]) {
      assert.equal((await api()[method](path).set(auth(applicant.token))).status, 403, `${method.toUpperCase()} ${path}`);
    }
  });

  test('only application:review holders review: not students, lecturers or (by default) registrars', async () => {
    const applicant = await createApplicant(7);
    const application = await submitApplication(applicant);
    const lecturer = await loginAs('lecturer');
    for (const who of [student, lecturer, registrar]) {
      assert.equal((await api().get('/api/applications').set(auth(who.token))).status, 403);
      assert.equal((await admit(application.id, {}, who)).status, 403);
    }
  });

  test('students have no applicant routes, and drafts are invisible to reviewers', async () => {
    assert.equal((await api().get('/api/applications/me').set(auth(student.token))).status, 403);
    const drafting = await createApplicant(8);
    await api().put('/api/applications/me').set(auth(drafting.token)).send({ phone: '+233 20 222 2222' });
    const [draft] = await query("SELECT a.id FROM admission_applications a JOIN users u ON u.id = a.user_id WHERE u.email = 'applicant8@personal.test'");
    assert.equal((await api().get(`/api/applications/${draft.id}`).set(auth(admin.token))).status, 404);
  });
});

describe('review', () => {
  test('reject records the reason, notifies the applicant, and is final', async () => {
    const applicant = await createApplicant(9);
    const application = await submitApplication(applicant);
    const res = await reject(application.id, { reason: 'Entry requirements not met' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'rejected');

    const mine = await api().get('/api/applications/me').set(auth(applicant.token));
    assert.equal(mine.body.data.application.status, 'rejected');
    assert.equal(mine.body.data.application.rejectionReason, 'Entry requirements not met');
    const notes = (await api().get('/api/notifications').set(auth(applicant.token))).body.data;
    assert.ok(notes.some((n) => n.type === 'APPLICATION_REJECTED' && n.message.includes('Entry requirements not met')));

    assert.equal((await admit(application.id)).status, 409, 'a rejected application cannot then be admitted');
  });

  test('admit creates exactly one student (Student ID, school email, programme, level) and ends the applicant session', async () => {
    const applicant = await createApplicant(10);
    const application = await submitApplication(applicant);

    const res = await admit(application.id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const admitted = res.body.data;
    assert.equal(admitted.status, 'admitted');
    assert.match(admitted.student.studentNumber, /^STU\d{9}$/);
    assert.equal(admitted.student.level, 200);
    assert.equal(JSON.stringify(res.body).includes('activation'), false, 'no activation token in the response');

    const [row] = await query(
      `SELECT s.program_id, s.admission_number, u.email, u.status, u.password_hash, u.activation_hash, r.name AS role
         FROM students s JOIN users u ON u.id = s.user_id JOIN roles r ON r.id = u.role_id WHERE s.id = :id`,
      { id: admitted.student.id },
    );
    assert.equal(row.program_id, application.programId);
    assert.equal(row.email, `${admitted.student.studentNumber.toLowerCase()}@students.scrs.edu`);
    assert.equal(row.role, 'USER');
    assert.equal(row.status, 'pending');
    assert.equal(row.admission_number, `APP${String(application.id).padStart(6, '0')}`);
    assert.match(row.activation_hash, /^[0-9a-f]{64}$/, 'only a hash of the token is stored');

    assert.equal((await api().get('/api/auth/me').set(auth(applicant.token))).status, 401, 'the applicant session is over');
    assert.equal((await api().post('/api/auth/login').send({ identifier: applicant.email, password: APPLICANT_PASSWORD })).status, 401);

    assert.equal((await admit(application.id)).status, 409, 'admitting twice is refused');
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM students WHERE user_id = :userId', { userId: application.userId });
    assert.equal(n, 1);

    const [audit] = await query("SELECT metadata FROM audit_logs WHERE action = 'application.admit' ORDER BY id DESC LIMIT 1");
    assert.equal(JSON.stringify(audit.metadata).includes(row.activation_hash), false);
  });

  test('parallel admits of the same application create one student', async () => {
    const applicant = await createApplicant(11);
    const application = await submitApplication(applicant);
    const results = await Promise.all([admit(application.id), admit(application.id), admit(application.id)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    const [{ n }] = await query('SELECT COUNT(*) AS n FROM students WHERE user_id = :userId', { userId: application.userId });
    assert.equal(n, 1);
  });

  test('the reviewer may adjust the level on admission, within the programme', async () => {
    const applicant = await createApplicant(12);
    const application = await submitApplication(applicant);
    assert.equal((await admit(application.id, { level: 900 })).status, 400);
    const res = await admit(application.id, { level: 100 });
    assert.equal(res.body.data.student.level, 100);
  });

  test('the admission email carries the Student ID, school email and activation link — never a PIN', () => {
    const message = admissionEmail({
      institution: 'SCRS', firstName: 'Ada', programName: 'Computer Science', level: 100,
      studentNumber: 'STU202600042', schoolEmail: 'stu202600042@students.scrs.edu', link: 'http://app/activate?token=abc', hours: 72,
    });
    assert.match(message.text, /STU202600042/);
    assert.match(message.text, /stu202600042@students\.scrs\.edu/);
    assert.match(message.text, /http:\/\/app\/activate\?token=abc/);
    assert.match(message.text, /expires in 72 hours/);
    assert.doesNotMatch(message.text, /\bPIN: \d{6}/);
  });
});

describe('activation', () => {
  const admitted = async (n) => {
    const applicant = await createApplicant(n);
    const application = await submitApplication(applicant);
    const res = await admit(application.id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return { applicant, application, studentNumber: res.body.data.student.studentNumber };
  };

  test('a valid link sets the PIN once; the student then signs in with Student ID + PIN', async () => {
    const { application, studentNumber } = await admitted(20);
    const token = await plantActivationToken(application.userId);

    assert.equal((await api().post('/api/auth/login').send({ identifier: studentNumber, password: PIN })).status, 401, 'no credential before activation');

    const res = await activate(token);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.studentNumber, studentNumber);
    assert.equal(res.headers['cache-control'], 'no-store');

    const session = await login(studentNumber, PIN);
    assert.equal(session.user.role.name, 'USER');
    assert.equal(session.user.student.studentNumber, studentNumber);
    assert.equal(session.user.mustChangePassword, false);

    assert.equal((await activate(token, '739164')).status, 400, 'single use');
    const [row] = await query('SELECT activation_hash, activation_expires FROM users WHERE id = :id', { id: application.userId });
    assert.equal(row.activation_hash, null);
  });

  test('an expired link is refused', async () => {
    const { application } = await admitted(21);
    const token = await plantActivationToken(application.userId);
    await query('UPDATE users SET activation_expires = NOW() - INTERVAL 1 MINUTE WHERE id = :id', { id: application.userId });
    const res = await activate(token);
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /invalid or has expired/);
  });

  test('a guessable PIN is refused and the link stays usable', async () => {
    const { application } = await admitted(22);
    const token = await plantActivationToken(application.userId);
    assert.equal((await activate(token, '123456')).status, 400);
    assert.equal((await activate(token, '111111')).status, 400);
    assert.equal((await activate(token, PIN, '000000')).status, 422, 'confirmation must match');
    assert.equal((await activate(token)).status, 200);
  });

  test('resending replaces the link; it is refused once the student has activated', async () => {
    const { application } = await admitted(23);
    const old = await plantActivationToken(application.userId);
    const resent = await api().post(`/api/applications/${application.id}/resend-activation`).set(auth(admin.token));
    assert.equal(resent.status, 200);
    assert.equal(JSON.stringify(resent.body).includes('token'), false);
    assert.equal((await activate(old)).status, 400, 'the earlier link no longer works');

    const fresh = await plantActivationToken(application.userId);
    assert.equal((await activate(fresh)).status, 200);
    assert.equal((await api().post(`/api/applications/${application.id}/resend-activation`).set(auth(admin.token))).status, 409);
  });
});

describe('from admission to an approved registration and timetable', () => {
  test('the activated student sees only programme/level-eligible courses, registers, and the registrar approves', async () => {
    const applicant = await createApplicant(30);
    const application = await submitApplication(applicant, { entryLevel: 100 });
    const admitted = await admit(application.id);
    const { studentNumber, id: studentId } = admitted.body.data.student;
    await activate(await plantActivationToken(application.userId));
    const me = await login(studentNumber, PIN);

    // Eligibility comes from the approved programme and level, enforced by the backend rules.
    const available = await api().get('/api/registrations/available-courses').set(auth(me.token));
    assert.equal(available.status, 200);
    const { program, courses } = available.body.data;
    assert.equal(program.id, application.programId);
    const cs201 = courses.find((c) => c.code === 'CS201').sections[0];
    assert.equal(cs201.status, 'blocked');
    assert.ok(cs201.reasons.some((r) => r.rule === 'LEVEL_ELIGIBILITY'), 'a level-200 course is not open to a level-100 student');

    const blocked = await api().post('/api/registrations/items').set(auth(me.token)).send({ courseSectionId: await sectionIdFor('CS201') });
    assert.equal(blocked.status, 422, 'the backend refuses it too, not just the listing');
    assert.ok(blocked.body.error.details.some((f) => f.rule === 'LEVEL_ELIGIBILITY'));

    // Promote to level 200 with the prerequisites passed, as a returning student would be.
    await query('UPDATE students SET level = 200 WHERE id = :studentId', { studentId });
    await query(
      `INSERT INTO results (student_id, course_id, grade, grade_point, passed, created_at, updated_at)
       SELECT :studentId, id, 'A', 4.0, true, NOW(), NOW() FROM courses WHERE code IN ('CS101', 'MATH101')`,
      { studentId },
    );
    for (const code of ['CS201', 'MATH201']) { // the minimum load is 6 credits
      assert.equal((await api().post('/api/registrations/items').set(auth(me.token)).send({ courseSectionId: await sectionIdFor(code) })).status, 201, code);
    }
    const submitted = await api().post('/api/registrations/submit').set(auth(me.token));
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

    // Students can never approve, their own registration or anyone's.
    assert.equal((await api().patch(`/api/admin/registrations/${submitted.body.data.id}/approve`).set(auth(me.token)).send({})).status, 403);

    const approved = await api().patch(`/api/admin/registrations/${submitted.body.data.id}/approve`).set(auth(registrar.token)).send({});
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.data.status, 'approved');
    assert.ok(approved.body.data.timetableConfirmedAt);

    const timetable = await api().get('/api/timetable/me').set(auth(me.token));
    assert.equal(timetable.body.data.registrationStatus, 'approved');
    assert.deepEqual(timetable.body.data.conflicts, []);
  });
});
