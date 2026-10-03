import { execSync } from 'node:child_process';
import http from 'node:http';
import request from 'supertest';
import sharp from 'sharp';
import app from '../../app.js';
import { sequelize } from '../../src/models/index.js';
import { REFRESH_COOKIE } from '../../src/utils/constants.js';
import { hashToken } from '../../src/utils/jwt.js';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Integration tests must run with NODE_ENV=test (use `npm test`) — they wipe the database.');
}

const cli = (cmd) => execSync(`npx sequelize-cli ${cmd}`, { env: { ...process.env, NODE_ENV: 'test' }, stdio: 'pipe' });

/** Recreates the <DB_NAME>_test schema from migrations and seeders. */
export const resetDatabase = () => {
  try { cli('db:drop'); } catch { /* did not exist */ }
  cli('db:create');
  cli('db:migrate');
  cli('db:seed:all');
};

// One server bound explicitly to 127.0.0.1. `request(app)` would listen on `::`, and on macOS the OS can
// then reuse a port another app (VS Code, Postman) already holds on 127.0.0.1 — supertest connects to
// 127.0.0.1 and gets that app's reply (e.g. 426 Upgrade Required) instead of ours.
const server = http.createServer(app);
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
server.unref();

export const api = () => request(server);

/** `identifier` is an email or a Student ID. */
export const login = async (identifier, password) => {
  const res = await api().post('/api/auth/login').send({ identifier, password });
  if (res.status !== 200) throw new Error(`Login failed for ${identifier}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookie = res.headers['set-cookie']?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`));
  return { token: res.body.data.accessToken, cookie, user: res.body.data.user };
};

// The admin is the one seeded account whose credentials come from .env (resolveAdminCredentials() in
// 20260926000001-roles-and-admin.cjs): SEED_ADMIN_EMAIL/PASSWORD if set, else these same published
// defaults. Reading them the same way here means changing your real .env's admin credentials — a normal
// thing to do for your own dev/production use — never breaks the suite; it stays in sync automatically.
export const accounts = {
  student: ['student@scrs.local', 'Student@12345'],
  lecturer: ['lecturer@scrs.local', 'Lecturer@12345'],
  registrar: ['registrar@scrs.local', 'Registrar@12345'],
  admin: [process.env.SEED_ADMIN_EMAIL || 'admin@scrs.local', process.env.SEED_ADMIN_PASSWORD || 'Admin@12345'],
};

export const loginAs = (who) => login(...accounts[who]);

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export const query = async (sql, replacements = {}) => (await sequelize.query(sql, { replacements }))[0];

export const sectionIdFor = async (code) =>
  (await query('SELECT s.id FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE c.code = :code', { code }))[0].id;

export const courseIdFor = async (code) => (await query('SELECT id FROM courses WHERE code = :code', { code }))[0].id;

export const programId = async () => (await query('SELECT id FROM programs LIMIT 1'))[0].id;

/** The PIN every `createStudent` student ends up with (after replacing the temporary one). */
export const STUDENT_PIN = '482915';

/**
 * Admits a fresh level-200 student who has passed CS101 and MATH101, the real way: an admin
 * admits them, they sign in with the temporary PIN and change it, then they're logged in.
 */
export const createStudent = async (n) => {
  const admin = await loginAs('admin');
  const admitted = await api().post('/api/admissions').set(auth(admin.token)).send({
    firstName: 'Test', lastName: `Student${n}`, programId: await programId(), admissionSession: '2026/2027', level: 200,
  });
  if (admitted.status !== 201) throw new Error(`Admission failed: ${JSON.stringify(admitted.body)}`);
  const { studentNumber, schoolEmail, pin } = admitted.body.data.credentials;
  const studentId = admitted.body.data.student.id;

  const first = await login(studentNumber, pin);
  const changed = await api().patch('/api/auth/pin').set(auth(first.token)).set('Cookie', first.cookie)
    .send({ currentPin: pin, newPin: STUDENT_PIN, confirmPin: STUDENT_PIN });
  if (changed.status !== 200) throw new Error(`PIN change failed: ${JSON.stringify(changed.body)}`);

  await query(
    `INSERT INTO results (student_id, course_id, grade, grade_point, passed, created_at, updated_at)
     SELECT :studentId, id, 'A', 4.0, true, NOW(), NOW() FROM courses WHERE code IN ('CS101', 'MATH101')`,
    { studentId },
  );
  return { token: changed.body.data.accessToken, studentId, userId: changed.body.data.user.id, email: schoolEmail, studentNumber };
};


/** A second ADMIN — the role that changes its own password or name without approval. */
export const createAdmin = async (n) => {
  const admin = await loginAs('admin');
  const email = `admin${n}@test.local`;
  const res = await api().post('/api/users').set(auth(admin.token)).send({
    firstName: 'Extra', lastName: `Admin${n}`, email, password: 'Passw0rd!', role: 'ADMIN',
  });
  if (res.status !== 201) throw new Error(`Create admin failed: ${JSON.stringify(res.body)}`);
  return { ...(await login(email, 'Passw0rd!')), email };
};

/**
 * The approved password-reset path for registrars and lecturers: "forgot password" files a request,
 * an admin approves it, and a reset link is emailed. The raw token only exists in that email, so
 * after checking approval stored one, a known token is planted the same way and returned.
 */
export const approvedResetToken = async (email) => {
  await api().post('/api/auth/forgot-password').send({ email });
  const [request] = await query(
    `SELECT r.id FROM account_change_requests r JOIN users u ON u.id = r.user_id
      WHERE u.email = :email AND r.type = 'password_reset' AND r.status = 'pending'`,
    { email },
  );
  if (!request) throw new Error(`No pending password reset request for ${email}`);
  // Start clean so the check below proves the approval itself issued a token.
  await query('UPDATE users SET password_reset_hash = NULL WHERE email = :email', { email });
  const admin = await loginAs('admin');
  const approved = await api().patch(`/api/admin/account-requests/${request.id}/approve`).set(auth(admin.token)).send({});
  if (approved.status !== 200) throw new Error(`Approve failed: ${JSON.stringify(approved.body)}`);

  const [{ hash }] = await query('SELECT password_reset_hash AS hash FROM users WHERE email = :email', { email });
  if (!hash) throw new Error('Approval did not issue a reset token');
  const raw = `planted-${email}-`.padEnd(48, 'x');
  await query('UPDATE users SET password_reset_hash = :hash WHERE email = :email', { hash: hashToken(raw), email });
  return raw;
};

// ── online admission ──────────────────────────────────────────────────────────

export const SIGN_UP_PASSWORD = 'Applicant1pass';

/** Signs up an applicant with a personal email, confirms the email (unless `verify: false`) and signs in. */
export const createApplicant = async (n, { verify = true } = {}) => {
  const email = `applicant${n}@personal.test`;
  const res = await api().post('/api/applications/account')
    .send({ firstName: 'Ada', lastName: `Applicant${n}`, email, password: SIGN_UP_PASSWORD });
  if (res.status !== 202) throw new Error(`Sign-up failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (verify) await query('UPDATE users SET email_verified_at = NOW() WHERE email = :email', { email });
  return { ...(await login(email, SIGN_UP_PASSWORD)), email };
};

/** A complete application for the demo BSC-CS programme at level 200 (the level the demo courses need). */
export const completeApplication = async (overrides = {}) => {
  const [program] = await query("SELECT id, department_id AS departmentId FROM programs WHERE code = 'BSC-CS'");
  return {
    dateOfBirth: '2005-04-12', phone: '+233 24 123 4567', departmentId: program.departmentId, programId: program.id, entryLevel: 200,
    ...overrides,
  };
};

// A real 16x16 JPEG (the avatar endpoint checks the file's actual bytes, and PDFKit has to decode it).
export const TEST_AVATAR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICBAICBAYEBAQGCAYGBgYICggICAgICgwKCgoKCgoMDAwMDAwMDA4ODg4ODhAQEBAQEhISEhISEhISEv/bAEMBAwMDBQQFCAQECBMNCw0TExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTExMTE//dAAQAAf/aAAwDAQACEQMRAD8A+D/Cfwp+7+7/AEr6Y8J/Cn7v7v8ASvpTwp8Kvu/uv0r6Z8J/Cn7v7v8ASvteIfEDf3zn8HvFH+H75//Z';

export const uploadAvatar = (user, image = TEST_AVATAR, thumb) =>
  api().put('/api/auth/me/avatar').set(auth(user.token)).send({ image, ...(thumb ? { thumb } : {}) });

/** A decodable official-application-photo upload: portrait, comfortably inside the 300-4000 px limits. */
export const makePhoto = (colour = { r: 200, g: 150, b: 120 }, width = 400, height = 520) =>
  sharp({ create: { width, height, channels: 3, background: colour } }).jpeg().toBuffer();
export const TEST_PHOTO = await makePhoto();

/** Uploads (or replaces) the applicant's OFFICIAL application photo, the raw image as the body. */
export const uploadApplicationPhoto = (user, body = TEST_PHOTO, type = 'image/jpeg') =>
  api().put('/api/applications/me/photo').set(auth(user.token)).set('Content-Type', type).send(body);

/** Saves and submits the applicant's application (the official photo is required to submit); returns the application row. */
export const submitApplication = async (applicant, overrides = {}) => {
  const photo = await uploadApplicationPhoto(applicant);
  if (photo.status !== 200) throw new Error(`Photo upload failed: ${JSON.stringify(photo.body)}`);
  const saved = await api().put('/api/applications/me').set(auth(applicant.token)).send(await completeApplication(overrides));
  if (saved.status !== 200) throw new Error(`Save failed: ${JSON.stringify(saved.body)}`);
  const submitted = await api().post('/api/applications/me/submit').set(auth(applicant.token));
  if (submitted.status !== 200) throw new Error(`Submit failed: ${JSON.stringify(submitted.body)}`);
  return submitted.body.data.application;
};

/**
 * The raw activation token only exists in the admission email. After checking admission stored a hash,
 * a known token is planted the same way (as `approvedResetToken` does) and returned.
 */
export const plantActivationToken = async (userId) => {
  const [{ hash }] = await query('SELECT activation_hash AS hash FROM users WHERE id = :userId', { userId });
  if (!hash) throw new Error('Admission did not issue an activation token');
  const raw = `planted-activation-${userId}-`.padEnd(48, 'x');
  await query('UPDATE users SET activation_hash = :hash WHERE id = :userId', { hash: hashToken(raw), userId });
  return raw;
};

export { sequelize };
