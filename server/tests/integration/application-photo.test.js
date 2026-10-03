/**
 * The OFFICIAL application photo: stored per application in private storage, editable only while the
 * application is a draft, locked for good at submit, and entirely separate from the profile picture.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {
  resetDatabase, api, loginAs, auth, query, sequelize, createApplicant, completeApplication, submitApplication,
  uploadAvatar, uploadApplicationPhoto, makePhoto, TEST_PHOTO, TEST_AVATAR, plantActivationToken,
} from './helpers.js';
import * as storage from '../../src/services/storage.service.js';

let admin;
before(async () => {
  resetDatabase();
  admin = await loginAs('admin');
});
after(() => sequelize.close());

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const row = async (userId) => (await query('SELECT * FROM admission_applications WHERE user_id = :userId', { userId }))[0];
const userIdOf = async (applicant) => (await query('SELECT id FROM users WHERE email = :email', { email: applicant.email }))[0].id;
const me = async (applicant) => (await api().get('/api/applications/me').set(auth(applicant.token))).body.data.application;
const getPhoto = (applicant) => api().get('/api/applications/me/photo').set(auth(applicant.token)).buffer(true).parse((res, cb) => {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
});
const submit = (applicant) => api().post('/api/applications/me/submit').set(auth(applicant.token));
const fillIn = async (applicant) => api().put('/api/applications/me').set(auth(applicant.token)).send(await completeApplication());

describe('draft: upload, replace, remove', () => {
  test('an applicant uploads a photo to a draft (even before saving any details); it is stored privately, not in MySQL', async () => {
    const applicant = await createApplicant(101);
    assert.equal((await me(applicant)), null);

    const res = await uploadApplicationPhoto(applicant);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const application = res.body.data.application;
    assert.equal(application.status, 'draft');
    assert.equal(application.photo.present, true);
    assert.equal(application.photo.locked, false);
    assert.ok(application.photo.uploadedAt);
    // The storage key and fingerprint never leave the server.
    assert.equal(JSON.stringify(res.body).includes('photoKey'), false);
    assert.equal(JSON.stringify(res.body).includes('photo_key'), false);

    const stored = await row(await userIdOf(applicant));
    assert.match(stored.photo_key, /^applications\/\d{4}\/\d+\/official-photo\/[0-9a-f-]{36}\.jpg$/);
    assert.match(stored.photo_sha256, /^[0-9a-f]{64}$/);
    assert.equal(stored.photo_locked_at, null);

    // It is served back to its owner as a JPEG, byte-identical to what was fingerprinted.
    const img = await getPhoto(applicant);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/jpeg');
    assert.equal(img.headers['cache-control'], 'private, no-store');
    assert.equal(sha(img.body), stored.photo_sha256);
    assert.equal((await sharp(img.body).metadata()).format, 'jpeg');
  });

  test('replacing before submission swaps the image and deletes the old one from storage', async () => {
    const applicant = await createApplicant(102);
    await uploadApplicationPhoto(applicant);
    const userId = await userIdOf(applicant);
    const first = await row(userId);

    const replaced = await uploadApplicationPhoto(applicant, await makePhoto({ r: 20, g: 40, b: 200 }));
    assert.equal(replaced.status, 200);
    const second = await row(userId);
    assert.notEqual(second.photo_key, first.photo_key);
    assert.notEqual(second.photo_sha256, first.photo_sha256);
    assert.equal(await storage.get(first.photo_key), null, 'the replaced object is gone');
    assert.ok(await storage.get(second.photo_key));
  });

  test('removing before submission clears it everywhere, and a new one can be added afterwards', async () => {
    const applicant = await createApplicant(103);
    await uploadApplicationPhoto(applicant);
    const userId = await userIdOf(applicant);
    const { photo_key: key } = await row(userId);

    const removed = await api().delete('/api/applications/me/photo').set(auth(applicant.token));
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.application.photo.present, false);
    assert.equal(await storage.get(key), null);
    assert.equal((await getPhoto(applicant)).status, 404);
    assert.equal((await api().delete('/api/applications/me/photo').set(auth(applicant.token))).status, 404, 'nothing left to remove');

    assert.equal((await uploadApplicationPhoto(applicant)).status, 200);
  });

  test('a photo uploaded to a draft that is never submitted just stays a draft photo', async () => {
    const applicant = await createApplicant(104);
    await uploadApplicationPhoto(applicant);
    const stored = await row(await userIdOf(applicant));
    assert.equal(stored.status, 'draft');
    assert.equal(stored.photo_locked_at, null);
    // Reviewers never see drafts, photo included.
    assert.equal((await api().get(`/api/applications/${stored.id}/photo`).set(auth(admin.token))).status, 404);
  });
});

describe('submit locks the photo', () => {
  test('submitting without an official photo is refused, naming what is missing', async () => {
    const applicant = await createApplicant(110);
    await fillIn(applicant);
    const res = await submit(applicant);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.error.details.missing, ['official application photo']);
    // A profile picture is a different thing and does not satisfy it.
    await uploadAvatar(applicant);
    assert.equal((await submit(applicant)).status, 400);
  });

  test('after submit the photo is locked: no replace, no delete, and the stored photo is unchanged', async () => {
    const applicant = await createApplicant(111);
    const application = await submitApplication(applicant);
    const userId = application.userId;
    const locked = await row(userId);
    assert.ok(locked.photo_locked_at, 'photo_locked_at is set by the submit');
    assert.equal(application.photo.locked, true);
    assert.ok(application.photo.lockedAt);

    const replace = await uploadApplicationPhoto(applicant, await makePhoto({ r: 1, g: 2, b: 3 }));
    assert.equal(replace.status, 409);
    assert.match(replace.body.error.message, /locked/i);
    const del = await api().delete('/api/applications/me/photo').set(auth(applicant.token));
    assert.equal(del.status, 409);

    const after = await row(userId);
    assert.equal(after.photo_key, locked.photo_key);
    assert.equal(after.photo_sha256, locked.photo_sha256);
    assert.ok(await storage.get(locked.photo_key), 'the stored object is untouched');
    assert.equal(sha(await storage.get(locked.photo_key)), locked.photo_sha256);
  });

  test('the lock lives in the database row, so it holds even if the status check were bypassed', async () => {
    const applicant = await createApplicant(112);
    const application = await submitApplication(applicant);
    // Simulate a status that looks editable but a recorded lock: still refused.
    await query("UPDATE admission_applications SET status = 'draft' WHERE id = :id", { id: application.id });
    assert.equal((await uploadApplicationPhoto(applicant)).status, 409);
    await query("UPDATE admission_applications SET status = 'submitted' WHERE id = :id", { id: application.id });
  });

  test('an upload racing the submit can never land after the lock', async () => {
    const applicant = await createApplicant(113);
    await uploadApplicationPhoto(applicant);
    await fillIn(applicant);
    const [replace, submitted] = await Promise.all([
      uploadApplicationPhoto(applicant, await makePhoto({ r: 9, g: 99, b: 199 })),
      submit(applicant),
    ]);
    assert.equal(submitted.status, 200);
    assert.ok([200, 409].includes(replace.status));
    const stored = await row(await userIdOf(applicant));
    assert.ok(stored.photo_locked_at);
    assert.ok(new Date(stored.photo_uploaded_at) <= new Date(stored.photo_locked_at), 'the photo was stored at or before the lock');
    assert.equal(sha(await storage.get(stored.photo_key)), stored.photo_sha256);
  });
});

describe('ownership and authorisation', () => {
  test("an applicant can only ever touch their own photo (there is no id to change), and cannot read another's", async () => {
    const alice = await createApplicant(120);
    const bob = await createApplicant(121);
    await uploadApplicationPhoto(alice, await makePhoto({ r: 255, g: 0, b: 0 }));
    const aliceRow = await row(await userIdOf(alice));

    // Bob has no photo of his own; he never sees Alice's.
    assert.equal((await getPhoto(bob)).status, 404);
    // Trying to aim at Alice's application id: the applicant routes ignore it, and the reviewer route is not his.
    assert.equal((await api().get(`/api/applications/${aliceRow.id}/photo`).set(auth(bob.token))).status, 403);
    assert.equal((await api().put(`/api/applications/${aliceRow.id}/photo`).set(auth(bob.token)).set('Content-Type', 'image/jpeg').send(TEST_PHOTO)).status, 404);
    assert.equal((await api().delete(`/api/applications/${aliceRow.id}/photo`).set(auth(bob.token))).status, 404);

    // Bob's own upload lands on Bob's application and leaves Alice's alone.
    await uploadApplicationPhoto(bob);
    assert.equal((await row(await userIdOf(alice))).photo_key, aliceRow.photo_key);
  });

  test('anonymous callers and non-applicant roles are refused', async () => {
    assert.equal((await api().put('/api/applications/me/photo').set('Content-Type', 'image/jpeg').send(TEST_PHOTO)).status, 401);
    assert.equal((await api().get('/api/applications/me/photo')).status, 401);
    for (const who of ['lecturer', 'registrar']) {
      const user = await loginAs(who);
      assert.equal((await uploadApplicationPhoto(user)).status, 403, who);
    }
  });

  test('reviewers can read the official photo of a submitted application, but there is no admin way to change it', async () => {
    const applicant = await createApplicant(122);
    const application = await submitApplication(applicant);
    const res = await api().get(`/api/applications/${application.id}/photo`).set(auth(admin.token)).buffer(true).parse((r, cb) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(sha(res.body), (await row(application.userId)).photo_sha256);

    const detail = await api().get(`/api/applications/${application.id}`).set(auth(admin.token));
    assert.equal(detail.body.data.photo.present, true);
    assert.equal(detail.body.data.photo.locked, true);
    // No admin write route exists for it.
    assert.equal((await api().put(`/api/applications/${application.id}/photo`).set(auth(admin.token)).set('Content-Type', 'image/jpeg').send(TEST_PHOTO)).status, 404);
    assert.equal((await api().delete(`/api/applications/${application.id}/photo`).set(auth(admin.token))).status, 404);
  });
});

describe('validation: only real photographs get in', () => {
  test('files that are not genuine images are refused', async () => {
    const applicant = await createApplicant(130);
    const disguised = await uploadApplicationPhoto(applicant, Buffer.from('<?php echo 1; ?> not an image at all'), 'image/jpeg');
    assert.equal(disguised.status, 400);
    const wrongType = await uploadApplicationPhoto(applicant, await sharp({ create: { width: 400, height: 400, channels: 3, background: '#fff' } }).png().toBuffer(), 'image/jpeg');
    assert.equal(wrongType.status, 400, 'a PNG claiming to be a JPEG');
    assert.equal((await uploadApplicationPhoto(applicant, Buffer.from('GIF89a....'), 'image/gif')).status, 400, 'gif is not allowed');
    assert.equal((await uploadApplicationPhoto(applicant, Buffer.from('{"a":1}'), 'application/json')).status, 400, 'a JSON body');
    assert.equal((await api().put('/api/applications/me/photo').set(auth(applicant.token)).set('Content-Type', 'image/jpeg')).status, 400, 'an empty body');
    assert.equal((await row(await userIdOf(applicant))), undefined, 'a refused upload creates nothing');
  });

  test('too small, too large in size, and too large in pixels are refused', async () => {
    const applicant = await createApplicant(131);
    assert.equal((await uploadApplicationPhoto(applicant, await makePhoto(undefined, 120, 120))).status, 400, 'under 300 px');
    const noisy = await sharp(crypto.randomBytes(1600 * 1600 * 3), { raw: { width: 1600, height: 1600, channels: 3 } }).png().toBuffer();
    assert.ok(noisy.length > 2 * 1024 * 1024);
    assert.equal((await uploadApplicationPhoto(applicant, noisy, 'image/png')).status, 413, 'over the 2 MB body limit');
    assert.equal((await uploadApplicationPhoto(applicant, await makePhoto(undefined, 4100, 400))).status, 400, 'over 4000 px');
  });

  test('a PNG or WebP is accepted and stored as a clean JPEG, with metadata stripped and large images shrunk', async () => {
    const applicant = await createApplicant(132);
    const png = await sharp({ create: { width: 1500, height: 2000, channels: 4, background: { r: 10, g: 120, b: 90, alpha: 0.5 } } })
      .withMetadata({ exif: { IFD0: { Copyright: 'secret-location' } } }).png().toBuffer();
    assert.equal((await uploadApplicationPhoto(applicant, png, 'image/png')).status, 200);
    const img = await getPhoto(applicant);
    const meta = await sharp(img.body).metadata();
    assert.equal(meta.format, 'jpeg');
    assert.equal(Math.max(meta.width, meta.height), 800);
    assert.equal(meta.exif, undefined, 'no EXIF survives');
    assert.equal(img.body.includes(Buffer.from('secret-location')), false);

    const webp = await sharp({ create: { width: 500, height: 600, channels: 3, background: '#336699' } }).webp().toBuffer();
    assert.equal((await uploadApplicationPhoto(applicant, webp, 'image/webp')).status, 200);
  });

  test('when photo storage is not configured the routes answer 503, health says so, and nothing else breaks', async () => {
    const applicant = await createApplicant(133);
    storage.useDriverForTests(null);
    try {
      const res = await uploadApplicationPhoto(applicant);
      assert.equal(res.status, 503);
      assert.equal(res.body.error.code, 'STORAGE_NOT_CONFIGURED');
      assert.equal((await api().get('/api/health')).body.data.integrations.storage, false);
      assert.equal((await api().get('/api/applications/me').set(auth(applicant.token))).status, 200);
    } finally {
      storage.useDriverForTests();
    }
    assert.equal((await api().get('/api/health')).body.data.integrations.storage, true);
  });
});

describe('profile picture and official photo are independent', () => {
  test('changing or removing the profile picture never touches the official photo, before or after submit', async () => {
    const applicant = await createApplicant(140);
    await uploadApplicationPhoto(applicant);
    const userId = await userIdOf(applicant);
    const draft = await row(userId);

    // Draft stage: profile picture set, then removed.
    assert.equal((await uploadAvatar(applicant)).status, 200);
    assert.equal((await row(userId)).photo_sha256, draft.photo_sha256);
    assert.equal((await api().delete('/api/auth/me/avatar').set(auth(applicant.token))).status, 200);
    assert.equal((await row(userId)).photo_key, draft.photo_key);

    await fillIn(applicant);
    assert.equal((await submit(applicant)).status, 200);
    const locked = await row(userId);

    // After submit: profile picture can still be changed and removed freely.
    assert.equal((await uploadAvatar(applicant, TEST_AVATAR, TEST_AVATAR)).status, 200);
    assert.equal((await api().get('/api/auth/me').set(auth(applicant.token))).body.data.avatar, TEST_AVATAR);
    assert.equal((await api().delete('/api/auth/me/avatar').set(auth(applicant.token))).status, 200);
    const after = await row(userId);
    assert.equal(after.photo_key, locked.photo_key);
    assert.equal(after.photo_sha256, locked.photo_sha256);
    assert.equal(after.photo_locked_at.getTime(), locked.photo_locked_at.getTime());
    assert.ok(await storage.get(locked.photo_key));
  });

  test('uploading the official photo does not set the profile picture', async () => {
    const applicant = await createApplicant(141);
    await uploadApplicationPhoto(applicant);
    assert.equal((await api().get('/api/auth/me').set(auth(applicant.token))).body.data.avatar, null);
  });
});

describe('admission: the official photo stays with the application', () => {
  const admitApplicant = async (n, { profilePicture = false } = {}) => {
    const applicant = await createApplicant(n);
    if (profilePicture) await uploadAvatar(applicant);
    const application = await submitApplication(applicant);
    const res = await api().post(`/api/applications/${application.id}/admit`).set(auth(admin.token)).send({});
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return { applicant, application };
  };
  const profile = async (userId) => (await query('SELECT avatar, avatar_thumb FROM users WHERE id = :userId', { userId }))[0];

  test('a new student starts with a separate copy of the official photo as their profile picture', async () => {
    const { application } = await admitApplicant(150);
    const before = await row(application.userId);
    const copied = await profile(application.userId);
    assert.match(copied.avatar, /^data:image\/jpeg;base64,/);
    assert.match(copied.avatar_thumb, /^data:image\/jpeg;base64,/);
    assert.equal((await sharp(Buffer.from(copied.avatar.split(',')[1], 'base64')).metadata()).width, 256);

    // The student later changes and removes their profile picture: the application record is untouched.
    const token = await plantActivationToken(application.userId);
    await api().post('/api/applications/activate').send({ token, pin: '482915', confirmPin: '482915' });
    const [{ student_number: number }] = await query('SELECT student_number FROM students WHERE user_id = :id', { id: application.userId });
    const student = await (await import('./helpers.js')).login(number, '482915');
    assert.equal((await uploadAvatar(student, TEST_AVATAR, TEST_AVATAR)).status, 200);
    assert.equal((await api().delete('/api/auth/me/avatar').set(auth(student.token))).status, 200);
    const after = await row(application.userId);
    assert.equal(after.photo_key, before.photo_key);
    assert.equal(after.photo_sha256, before.photo_sha256);
    assert.equal(sha(await storage.get(after.photo_key)), after.photo_sha256);
    const detail = await api().get(`/api/applications/${application.id}`).set(auth(admin.token));
    assert.equal(detail.body.data.photo.present, true);
  });

  test('a profile picture the applicant already set is kept, not overwritten by the copy', async () => {
    const { application } = await admitApplicant(151, { profilePicture: true });
    assert.equal((await profile(application.userId)).avatar, TEST_AVATAR);
  });
});
