import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  resetDatabase, api, loginAs, auth, query, sectionIdFor, createStudent, sequelize, uploadAvatar, makePhoto,
} from './helpers.js';
import * as storage from '../../src/services/storage.service.js';

let student;
let registrar;
let registrationId;

const binary = (res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};
const slip = (who, id, format) => {
  const req = api().get(`/api/registrations/${id}/slip${format ? `?format=${format}` : ''}`).set(auth(who.token));
  return format === 'json' ? req : req.buffer(true).parse(binary);
};
const add = async (who, code) =>
  api().post('/api/registrations/items').set(auth(who.token)).send({ courseSectionId: await sectionIdFor(code) });

before(async () => {
  resetDatabase();
  [student, registrar] = await Promise.all([loginAs('student'), loginAs('registrar')]);
  await add(student, 'CS201');
  const res = await add(student, 'CS203');
  registrationId = res.body.data.registration.id;
});
after(() => sequelize.close());

describe('registration slip', () => {
  test('a draft registration cannot be printed yet', async () => {
    const res = await slip(student, registrationId, 'json');
    assert.equal(res.status, 409);
    assert.equal(res.body.error.message, 'Submit your registration before printing a slip');
  });

  test('after submitting: a provisional PDF slip with a reference number', async () => {
    const submitted = await api().post('/api/registrations/submit').set(auth(student.token));
    const reference = submitted.body.data.referenceNumber;
    assert.match(reference, /^REG-\d{4}-\d{2}-\d{6}$/);

    const pdf = await slip(student, registrationId);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers['content-type'], 'application/pdf');
    assert.equal(pdf.headers['content-disposition'], `attachment; filename="registration-slip-${reference}.pdf"`);
    assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.body.length > 1500);

    const json = await slip(student, registrationId, 'json');
    const data = json.body.data;
    assert.equal(data.status, 'provisional');
    assert.equal(data.referenceNumber, reference);
    assert.equal(data.student.studentNumber, 'STU2025001');
    assert.equal(data.semester.name, 'Current Semester');
    assert.deepEqual(data.courses.map((c) => c.code), ['CS201', 'CS203']);
    assert.deepEqual(data.courses[0].schedule, ['MON 08:00–10:00 LT-1', 'THU 08:00–09:00 LT-1']);
    assert.equal(data.totalCredits, 6);
    assert.match(data.verificationCode, /^[0-9A-F]{10}$/);
  });

  test('only the owner, or staff, can get it', async () => {
    const other = await createStudent(1);
    assert.equal((await slip(other, registrationId, 'json')).status, 404);
    assert.equal((await api().get(`/api/registrations/${registrationId}/slip`)).status, 401);

    const staff = await api().get(`/api/admin/registrations/${registrationId}/slip?format=json`).set(auth(registrar.token));
    assert.equal(staff.status, 200);
    assert.equal(staff.body.data.student.name, 'Ama Mensah');
    assert.equal((await api().get(`/api/admin/registrations/${registrationId}/slip`).set(auth(student.token))).status, 403);
  });

  test('once approved, the slip is confirmed and names the approver', async () => {
    await api().patch(`/api/admin/registrations/${registrationId}/approve`).set(auth(registrar.token)).send({});
    const data = (await slip(student, registrationId, 'json')).body.data;
    assert.equal(data.status, 'confirmed');
    assert.equal(data.approvedBy, 'Esi Boateng');
    assert.ok(data.approvedAt);
  });

  test('the PDF carries the OFFICIAL application photo, not the profile picture; JSON and verify never carry any photo', async () => {
    const plain = await slip(student, registrationId);
    assert.equal(plain.status, 200);

    // A profile picture alone changes nothing on the slip: it is not the official photo.
    assert.equal((await uploadAvatar(student)).status, 200);
    const withProfilePicture = await slip(student, registrationId);
    assert.equal(withProfilePicture.body.length, plain.body.length, 'a profile picture is not printed');

    // The photo submitted with the student's admission application is.
    const [{ id: userId }] = await query("SELECT id FROM users WHERE email = 'student@scrs.local'");
    const photo = await makePhoto({ r: 40, g: 120, b: 200 });
    const key = 'applications/2026/9999/official-photo/slip-test.jpg';
    await storage.put(key, photo, 'image/jpeg');
    await query(
      `INSERT INTO admission_applications (user_id, personal_email, first_name, last_name, status, photo_key, photo_uploaded_at, photo_locked_at, created_at, updated_at)
       VALUES (:userId, 'slip.photo@personal.test', 'Ama', 'Mensah', 'admitted', :key, NOW(), NOW(), NOW(), NOW())`,
      { userId, key },
    );
    const withOfficial = await slip(student, registrationId);
    assert.equal(withOfficial.status, 200);
    assert.equal(withOfficial.body.subarray(0, 5).toString(), '%PDF-');
    assert.ok(withOfficial.body.length > plain.body.length, 'the official photo is embedded in the PDF');

    const json = (await slip(student, registrationId, 'json')).body.data;
    assert.equal('photo' in json.student, false);
    assert.equal(JSON.stringify(json).includes('/9j/'), false, 'no image data in the JSON slip');
    const verified = await api().get(`/api/registrations/verify/${json.referenceNumber}?code=${json.verificationCode}`);
    assert.equal(JSON.stringify(verified.body).includes('/9j/'), false, 'no image data on the public verify');

    // A slip never fails because of its picture: if the stored photo cannot be read, it prints without one.
    await storage.remove(key);
    const missing = await slip(student, registrationId);
    assert.equal(missing.status, 200);
    assert.equal(missing.body.subarray(0, 5).toString(), '%PDF-');
    assert.equal(missing.body.length, plain.body.length);

    // ...and the same when the storage service itself errors.
    await storage.put(key, photo, 'image/jpeg');
    storage.useDriverForTests({ name: 'broken', get: async () => { throw new Error('storage is down'); }, put: async () => {}, remove: async () => {} });
    try {
      const broken = await slip(student, registrationId);
      assert.equal(broken.status, 200);
      assert.equal(broken.body.subarray(0, 5).toString(), '%PDF-');
      assert.equal(broken.body.length, plain.body.length);
    } finally {
      storage.useDriverForTests();
      await storage.remove(key);
    }
    await query('DELETE FROM admission_applications WHERE user_id = :userId', { userId });
  });

  test('anyone can verify a printed slip with its code; details are hidden without it', async () => {
    const { referenceNumber, verificationCode } = (await slip(student, registrationId, 'json')).body.data;

    const ok = await api().get(`/api/registrations/verify/${referenceNumber}?code=${verificationCode.toLowerCase()}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.data, {
      valid: true,
      referenceNumber,
      status: 'confirmed',
      student: { name: 'Ama Mensah', studentNumber: 'STU*****01' },
      semester: 'Current Semester',
      courses: ['CS201', 'CS203'],
      totalCredits: 6,
    });

    assert.deepEqual((await api().get(`/api/registrations/verify/${referenceNumber}?code=0000000000`)).body.data, { valid: false });
    assert.deepEqual((await api().get(`/api/registrations/verify/${referenceNumber}`)).body.data, { valid: false });
    assert.deepEqual((await api().get('/api/registrations/verify/REG-2026-02-999999?code=ABC')).body.data, { valid: false });
    assert.equal((await api().get('/api/registrations/verify/not-a-reference')).status, 422);
  });

  test('an old printout stops verifying after a course is added; the reference number never changes', async () => {
    const before = (await slip(student, registrationId, 'json')).body.data;

    const added = await add(student, 'MATH201');
    assert.equal(added.status, 201);
    // Changing an approved registration sends it back for approval but keeps its reference number.
    assert.equal(added.body.data.registration.status, 'submitted');
    assert.equal(added.body.data.registration.referenceNumber, before.referenceNumber);

    const stale = await api().get(`/api/registrations/verify/${before.referenceNumber}?code=${before.verificationCode}`);
    assert.equal(stale.body.data.valid, false);

    const fresh = (await slip(student, registrationId, 'json')).body.data;
    assert.notEqual(fresh.verificationCode, before.verificationCode);
    const check = await api().get(`/api/registrations/verify/${fresh.referenceNumber}?code=${fresh.verificationCode}`);
    assert.equal(check.body.data.valid, true);
    assert.equal(check.body.data.status, 'provisional', 'changes send it back for approval');
  });
});
