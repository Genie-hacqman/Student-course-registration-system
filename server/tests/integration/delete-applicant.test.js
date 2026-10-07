import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  resetDatabase, api, loginAs, auth, query, sequelize, createApplicant, submitApplication, uploadAvatar,
} from './helpers.js';
import { deleteApplicant, RefusedError } from '../../scripts/delete-applicant.mjs';
import * as storage from '../../src/services/storage.service.js';

let admin;
before(async () => {
  resetDatabase();
  admin = await loginAs('admin');
});
after(() => sequelize.close());

const userRow = async (id) => (await query('SELECT id FROM users WHERE id = :id', { id }))[0];
const appRow = async (userId) => (await query('SELECT * FROM admission_applications WHERE user_id = :userId', { userId }))[0];
const admit = async (application) => {
  const res = await api().post(`/api/applications/${application.id}/admit`).set(auth(admin.token)).send({});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.application.student;
};
const refused = (promise, pattern) => assert.rejects(promise, (err) => err instanceof RefusedError && pattern.test(err.message));

describe('dry run', () => {
  test('shows the database, the account and what would go, and changes nothing', async () => {
    const applicant = await createApplicant(201);
    const application = await submitApplication(applicant);
    const plan = await deleteApplicant({ email: applicant.email });

    assert.equal(plan.deleted, false);
    assert.match(plan.database, /_test$/);
    assert.equal(plan.user.email, applicant.email);
    assert.equal(plan.application.number, `APP${String(application.id).padStart(6, '0')}`);
    assert.equal(plan.application.status, 'submitted');
    assert.ok(plan.application.photoKey);
    assert.equal(plan.studentNumber, null);
    assert.ok(await userRow(application.userId), 'still there');
    assert.ok(await storage.get(plan.application.photoKey), 'photo still there');
  });
});

describe('deleting', () => {
  test('a submitted applicant: account, application, notifications and photo go; the audit history stays', async () => {
    const applicant = await createApplicant(202);
    await uploadAvatar(applicant);
    const application = await submitApplication(applicant);
    const { photo_key: key } = await appRow(application.userId);
    const auditBefore = (await query('SELECT COUNT(*) AS n FROM audit_logs WHERE user_id = :id', { id: application.userId }))[0].n;
    assert.ok(Number(auditBefore) > 0);

    const result = await deleteApplicant({ email: applicant.email, apply: true });
    assert.equal(result.deleted, true);
    assert.equal(result.photo, 'removed');
    assert.equal(result.removes.profilePicture, true);

    assert.equal(await userRow(application.userId), undefined);
    assert.equal(await appRow(application.userId), undefined);
    assert.equal((await query('SELECT COUNT(*) AS n FROM notifications WHERE user_id = :id', { id: application.userId }))[0].n, 0);
    assert.equal(await storage.get(key), null, 'the photo object is gone from storage');

    const [entry] = await query("SELECT metadata FROM audit_logs WHERE action = 'applicant.delete' AND entity_id = :id", { id: application.userId });
    const metadata = typeof entry.metadata === 'string' ? JSON.parse(entry.metadata) : entry.metadata;
    assert.equal(metadata.via, 'applicant:delete');
    assert.equal(metadata.applicationNumber, `APP${String(application.id).padStart(6, '0')}`);
    assert.equal(metadata.name, undefined);
    assert.equal(metadata.email, undefined);
    assert.equal(metadata.personalEmail, undefined);
    assert.ok(!JSON.stringify(metadata).includes(applicant.email));
    assert.equal(metadata.emailFingerprint, createHash('sha256').update(applicant.email.toLowerCase()).digest('hex').slice(0, 16));
    const kept = (await query("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'application.submit' AND entity_id = :id", { id: application.id }))[0].n;
    assert.equal(Number(kept), 1);

    await refused(deleteApplicant({ email: applicant.email }), /No account or application found/);
  });

  test('an admitted test student: found by their personal email, deleted only with --include-admitted', async () => {
    const applicant = await createApplicant(203);
    const application = await submitApplication(applicant);
    const student = await admit(application);

    await refused(deleteApplicant({ email: applicant.email, apply: true }), /has been admitted .*--include-admitted/);
    assert.ok(await userRow(application.userId), 'nothing removed without the flag');

    const result = await deleteApplicant({ email: applicant.email, apply: true, includeAdmitted: true });
    assert.equal(result.deleted, true);
    assert.equal(result.studentNumber, student.studentNumber);
    assert.equal((await query('SELECT COUNT(*) AS n FROM students WHERE id = :id', { id: student.id }))[0].n, 0);
    assert.equal(await userRow(application.userId), undefined);
  });
});

describe('refusals', () => {
  test('never touches staff', async () => {
    await refused(deleteApplicant({ email: 'lecturer@scrs.local', apply: true }), /LECTURER account/);
    await refused(deleteApplicant({ email: 'registrar@scrs.local', apply: true }), /REGISTRAR account/);
    assert.equal((await query("SELECT COUNT(*) AS n FROM users WHERE email = 'lecturer@scrs.local'"))[0].n, 1);
  });

  test('never touches a student admitted by staff, even with --include-admitted', async () => {
    await refused(deleteApplicant({ email: 'student@scrs.local', apply: true, includeAdmitted: true }), /admitted by staff/);
  });

  test('never deletes a student with academic records, even with --include-admitted', async () => {
    const applicant = await createApplicant(204);
    const application = await submitApplication(applicant);
    const student = await admit(application);
    await query(
      `INSERT INTO results (student_id, course_id, grade, grade_point, passed, created_at, updated_at)
       SELECT :studentId, id, 'A', 4.0, true, NOW(), NOW() FROM courses WHERE code = 'CS101'`,
      { studentId: student.id },
    );
    await refused(deleteApplicant({ email: applicant.email, apply: true, includeAdmitted: true }), /academic records \(1 results\)/);
    assert.ok(await userRow(application.userId));
  });

  test('unknown or missing email', async () => {
    await refused(deleteApplicant({ email: 'nobody@nowhere.test' }), /No account or application found/);
    await refused(deleteApplicant({ email: '' }), /Give the account's email/);
  });
});
