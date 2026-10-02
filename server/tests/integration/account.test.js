import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken } from '../../src/utils/jwt.js';
import {
  resetDatabase, api, login, loginAs, auth, query, programId, sequelize, uploadAvatar, createApplicant, TEST_AVATAR,
} from './helpers.js';

before(resetDatabase);
after(() => sequelize.close());

describe('email verification', () => {
  test('an unverified account is verified with the emailed token', async () => {
    // Every account is created verified now (admission, staff); this covers any that aren't, e.g. older ones.
    const admin = await loginAs('admin');
    await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'Nana', lastName: 'Ansah', email: 'verify@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    await query("UPDATE users SET email_verified_at = NULL WHERE email = 'verify@test.local'");
    const res = await api().post('/api/auth/login').send({ identifier: 'verify@test.local', password: 'Passw0rd!' });
    assert.equal(res.body.data.user.emailVerifiedAt, null);
    assert.equal(JSON.stringify(res.body).includes('emailVerificationHash'), false);
    const token = res.body.data.accessToken;

    assert.equal((await api().post('/api/auth/verify-email/resend').set(auth(token))).status, 200);

    // The raw token only exists in the email, so plant a known one the way the service stores it.
    const raw = 'k'.repeat(40);
    await query("UPDATE users SET email_verification_hash = :hash WHERE email = 'verify@test.local'", { hash: hashToken(raw) });
    assert.equal((await api().post('/api/auth/verify-email').send({ token: raw })).status, 200);

    const me = await api().get('/api/auth/me').set(auth(token));
    assert.ok(me.body.data.emailVerifiedAt);
    assert.equal((await api().post('/api/auth/verify-email').send({ token: raw })).status, 400, 'a token works once');
    assert.equal((await api().post('/api/auth/verify-email/resend').set(auth(token))).status, 409);
  });

  test('an expired token is rejected', async () => {
    const raw = 'e'.repeat(40);
    await query(
      "UPDATE users SET email_verified_at = NULL, email_verification_hash = :hash, email_verification_expires = NOW() - INTERVAL 1 MINUTE WHERE email = 'verify@test.local'",
      { hash: hashToken(raw) },
    );
    const res = await api().post('/api/auth/verify-email').send({ token: raw });
    assert.equal(res.status, 400);
    assert.match(res.body.error.message, /expired/);
  });

  test('seeded and staff-created accounts count as verified', async () => {
    const { user } = await loginAs('student');
    assert.ok(user.emailVerifiedAt);
    const admin = await loginAs('admin');
    const created = await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'Staff', lastName: 'Made', email: 'staffmade@test.local', password: 'Passw0rd!', role: 'LECTURER',
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.emailVerifiedAt);
  });
});

describe('profile', () => {
  test('an admin renames themselves directly, and nothing but the name changes', async () => {
    const student = await loginAs('student');
    const refused = await api().patch('/api/auth/me').set(auth(student.token)).send({ firstName: 'Amma' });
    assert.equal(refused.status, 403);
    assert.match(refused.body.error.message, /approval/);

    const { token } = await loginAs('admin');
    const res = await api().patch('/api/auth/me').set(auth(token)).send({ firstName: 'Root', email: 'hijack@test.local', role: 'STUDENT' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.firstName, 'Root');
    assert.equal(res.body.data.role.name, 'ADMIN');
    assert.notEqual(res.body.data.email, 'hijack@test.local');
    assert.equal((await api().patch('/api/auth/me').set(auth(token)).send({})).status, 422);
    assert.equal((await api().patch('/api/auth/me').send({ firstName: 'X' })).status, 401);
  });
});

describe('profile picture', () => {
  test('every role can set their own picture, and it comes back from /auth/me', async () => {
    for (const who of ['admin', 'registrar', 'lecturer', 'student']) {
      const user = await loginAs(who);
      assert.equal((await uploadAvatar(user)).status, 200, who);
      const me = await api().get('/api/auth/me').set(auth(user.token));
      assert.equal(me.body.data.avatar, TEST_AVATAR, who);
    }
  });

  test('anything that is not a real JPG, PNG or WebP is refused', async () => {
    const user = await loginAs('lecturer');
    const text = `data:image/jpeg;base64,${Buffer.from('definitely not an image').toString('base64')}`;
    assert.equal((await uploadAvatar(user, text)).status, 400, 'spoofed type');
    assert.equal((await uploadAvatar(user, 'data:image/svg+xml;base64,PHN2Zy8+')).status, 422, 'svg');
    assert.equal((await uploadAvatar(user, 'https://example.com/me.jpg')).status, 422, 'a url');
    const big = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(210 * 1024)]).toString('base64')}`;
    assert.equal((await uploadAvatar(user, big)).status, 400, 'too large');
  });

  test('staff can remove their picture; students and applicants can only replace theirs', async () => {
    const lecturer = await loginAs('lecturer');
    assert.equal((await api().delete('/api/auth/me/avatar').set(auth(lecturer.token))).status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(lecturer.token))).body.data.avatar, null);

    const applicant = await createApplicant(30);
    await uploadAvatar(applicant);
    assert.equal((await api().delete('/api/auth/me/avatar').set(auth(applicant.token))).status, 400);
    assert.equal((await api().get('/api/auth/me').set(auth(applicant.token))).body.data.avatar, TEST_AVATAR);
  });

  test('a small thumbnail is stored beside the picture, is optional, and is checked like the picture', async () => {
    const user = await loginAs('registrar');
    assert.equal((await uploadAvatar(user, TEST_AVATAR, TEST_AVATAR)).status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(user.token))).body.data.avatarThumb, TEST_AVATAR);

    const text = `data:image/jpeg;base64,${Buffer.from('not an image').toString('base64')}`;
    assert.equal((await uploadAvatar(user, TEST_AVATAR, text)).status, 400, 'spoofed thumbnail');
    const big = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(11 * 1024)]).toString('base64')}`;
    assert.equal((await uploadAvatar(user, TEST_AVATAR, big)).status, 400, 'oversized thumbnail');
    assert.equal((await uploadAvatar(user, TEST_AVATAR, 'data:image/png;base64,AAAA')).status, 422, 'thumbnail must be a JPEG');

    // Replacing without a thumbnail clears the old one, so a stale face never outlives its picture.
    assert.equal((await uploadAvatar(user)).status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(user.token))).body.data.avatarThumb, null);
  });

  test('lists carry the thumbnail but never the full picture', async () => {
    const admin = await loginAs('admin');
    const student = await loginAs('student');
    await uploadAvatar(student, TEST_AVATAR, TEST_AVATAR);
    const students = await api().get('/api/students').set(auth(admin.token));
    const row = students.body.data.find((s) => s.studentNumber === 'STU2025001');
    assert.equal(row.user.avatarThumb, TEST_AVATAR);
    assert.equal('avatar' in row.user, false);
    const users = await api().get('/api/users').set(auth(admin.token));
    assert.equal(users.body.data.some((u) => 'avatar' in u), false);
  });

  test('requires sign-in', async () => {
    assert.equal((await api().put('/api/auth/me/avatar').send({ image: TEST_AVATAR })).status, 401);
  });
});

describe('sessions', () => {
  test('lists signed-in devices and ends one without affecting the others', async () => {
    const laptop = await login('lecturer@scrs.local', 'Lecturer@12345');
    const phone = await login('lecturer@scrs.local', 'Lecturer@12345');

    const list = await api().get('/api/auth/sessions').set(auth(laptop.token)).set('Cookie', laptop.cookie);
    assert.equal(list.status, 200);
    assert.ok(list.body.data.length >= 2);
    const current = list.body.data.filter((s) => s.current);
    assert.equal(current.length, 1);
    const phoneSession = list.body.data.find((s) => !s.current && s.id > current[0].id);
    assert.equal(JSON.stringify(list.body.data).includes('tokenHash'), false);

    assert.equal((await api().delete(`/api/auth/sessions/${current[0].id}`).set(auth(laptop.token)).set('Cookie', laptop.cookie)).status, 400);
    assert.equal((await api().delete(`/api/auth/sessions/${phoneSession.id}`).set(auth(laptop.token)).set('Cookie', laptop.cookie)).status, 204);

    // The phone is cut off at once: its access token and its refresh token both stop working.
    assert.equal((await api().get('/api/auth/me').set(auth(phone.token))).status, 401);
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', phone.cookie)).status, 401);
    // ...and presenting that ended session's token is not treated as theft: the laptop keeps working.
    assert.equal((await api().post('/api/auth/refresh').set('Cookie', laptop.cookie)).status, 200);

    assert.equal((await api().delete('/api/auth/sessions/999999').set(auth(laptop.token))).status, 404);
  });

  test('a user cannot end someone else’s session', async () => {
    const other = await loginAs('registrar');
    const [{ id }] = await query(
      "SELECT rt.id FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE u.email = 'registrar@scrs.local' AND rt.revoked_at IS NULL LIMIT 1",
    );
    const { token } = await loginAs('student');
    assert.equal((await api().delete(`/api/auth/sessions/${id}`).set(auth(token))).status, 404);
    assert.equal((await api().get('/api/auth/me').set(auth(other.token))).status, 200);
  });
});

describe('user administration', () => {
  test('a user record includes its student or lecturer profile', async () => {
    const admin = await loginAs('admin');
    const [{ id }] = await query("SELECT id FROM users WHERE email = 'student@scrs.local'");
    const res = await api().get(`/api/users/${id}`).set(auth(admin.token));
    assert.equal(res.body.data.student.studentNumber, 'STU2025001');
    assert.equal(res.body.data.student.program.code.length > 0, true);
    assert.equal(res.body.data.lecturer, null);
  });

  test('a student profile created by staff gets a generated number unless one is given', async () => {
    const admin = await loginAs('admin');
    const make = async (email) => (await api().post('/api/users').set(auth(admin.token)).send({
      firstName: 'New', lastName: 'Student', email, password: 'Passw0rd!', role: 'STUDENT',
    })).body.data.id;

    const generated = await api().post('/api/students').set(auth(admin.token)).send({ userId: await make('gen@test.local'), programId: await programId() });
    assert.equal(generated.status, 201);
    assert.match(generated.body.data.studentNumber, /^STU\d{8,}$/);

    const userId = await make('given@test.local');
    const given = await api().post('/api/students').set(auth(admin.token)).send({ userId, programId: await programId(), studentNumber: 'ADM-0042', level: 300 });
    assert.equal(given.body.data.studentNumber, 'ADM-0042');
    assert.equal(given.body.data.level, 300);
    assert.equal((await api().post('/api/students').set(auth(admin.token)).send({ userId, programId: await programId() })).status, 409);
  });

  test('settings values are validated per key', async () => {
    const admin = await loginAs('admin');
    const patch = (settings) => api().patch('/api/admin/settings').set(auth(admin.token)).send({ settings });
    assert.equal((await patch([{ key: 'registration.requireApproval', value: 'yes' }])).status, 422);
    assert.equal((await patch([{ key: 'registration.defaultMaxCredits', value: 0 }])).status, 422);
    assert.equal((await patch([{ key: 'grades.passingGrade', value: 'W' }])).status, 422);
    assert.equal((await patch([{ key: 'no.such.setting', value: 1 }])).status, 422);
    assert.equal((await patch([{ key: 'grades.passingGrade', value: 'C' }, { key: 'institution.name', value: 'UniReg University' }])).status, 200);
  });
});
