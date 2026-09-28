import { Op, UniqueConstraintError } from 'sequelize';
import {
  sequelize, User, Role, Student, Program, Department, AdmissionApplication, AcademicYear, Semester,
} from '../models/index.js';
import env from '../config/env.js';
import { BadRequestError, ConflictError, NotFoundError, TooManyAttemptsError } from '../utils/errors.js';
import { APPLICATION_STATUS, ROLES, USER_STATUS } from '../utils/constants.js';
import { hashPassword, UNUSABLE_PASSWORD_HASH } from '../utils/password.js';
import { generateOpaqueToken, hashToken } from '../utils/jwt.js';
import { pinProblem } from '../utils/pin.js';
import { buildPagination } from '../utils/pagination.js';
import { assignStudentIdentity, studentEmailDomain, studentRoleId } from './admission.service.js';
import { issueVerificationToken, sendVerificationEmail } from './auth.service.js';
import * as sessionService from './session.service.js';
import * as notificationService from './notification.service.js';
import * as emailService from './email.service.js';
import * as settingService from './setting.service.js';
import * as audit from './audit.service.js';

/*
 * Online admission. A prospective student signs up with their personal email (APPLICANT role), fills in
 * one application and submits it; an admin (application:review) admits or rejects it.
 *
 * Admitting is the one event that creates the official student record: the same user row becomes a
 * student (USER role) with a generated Student ID and school email, via the same assignStudentIdentity
 * as staff admission. The account is left `pending` with no usable password, and the applicant's
 * personal email gets a single-use, time-limited activation link (only its sha256 hash is stored).
 * Activating sets the student's own PIN; from then on they sign in like every other student.
 *
 * Raw tokens are returned from these functions for tests only; controllers never send them.
 */

const { DRAFT, SUBMITTED, ADMITTED, REJECTED } = APPLICATION_STATUS;

const programInclude = {
  model: Program,
  as: 'program',
  attributes: ['id', 'name', 'code', 'durationYears', 'qualificationCode', 'departmentId'],
};
const detailInclude = [
  programInclude,
  { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
  { model: Student, as: 'student', attributes: ['id', 'studentNumber', 'level'] },
  { model: User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] },
  { model: User, as: 'user', attributes: ['id', 'status', 'emailVerifiedAt'] },
];

const activationLink = (token) => `${env.FRONTEND_URL}/activate-account?token=${token}`;

/** Minimum gap between two sends of the admission email for one application. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/** Levels a programme admits into: 100 up to its final year. */
const maxLevelFor = (program) => program.durationYears * 100;

/**
 * Checks the programme/department/level choice against the configured programmes. Returns the
 * programme, or throws. The department is always the programme's own.
 */
const checkChoice = async ({ departmentId, programId, entryLevel }, transaction) => {
  if (!programId) return null;
  const program = await Program.findByPk(programId, { transaction });
  if (!program) throw new BadRequestError('Choose one of the listed programmes');
  if (departmentId && departmentId !== program.departmentId) {
    throw new BadRequestError(`${program.name} is not offered by the chosen department`);
  }
  if (entryLevel && (entryLevel % 100 !== 0 || entryLevel > maxLevelFor(program))) {
    throw new BadRequestError(`${program.name} admits at levels 100 to ${maxLevelFor(program)}`);
  }
  return program;
};

/** "2026/2027": the current semester's academic year if it's named that way, else derived from today's date. */
const defaultSession = async (transaction) => {
  const current = await Semester.findOne({
    where: { isCurrent: true },
    include: [{ model: AcademicYear, as: 'academicYear', attributes: ['name'] }],
    transaction,
  });
  const name = current?.academicYear?.name ?? '';
  if (/^\d{4}\/\d{4}$/.test(name)) return name;
  const year = new Date().getUTCFullYear();
  return `${year}/${year + 1}`;
};

// ── applicant ────────────────────────────────────────────────────────────────

/**
 * Creates an applicant account and emails a verification link. Resolves the same way when the email
 * is already registered (nothing is created or sent), so the endpoint can't be used to find accounts.
 */
export const signUp = async ({ firstName, lastName, email, password }, req) => {
  // Also taken: a personal email an application already used. After admission that account's email
  // becomes the school address, and one person must not end up with a second application.
  const [existingUser, existingApplication] = await Promise.all([
    User.findOne({ where: { email }, attributes: ['id'] }),
    AdmissionApplication.findOne({ where: { personalEmail: email }, attributes: ['id'] }),
  ]);
  if (existingUser || existingApplication) return null;

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await sequelize.transaction(async (transaction) => {
      const role = await Role.findOne({ where: { name: ROLES.APPLICANT }, transaction });
      if (!role) throw new Error('APPLICANT role missing — run the migrations');
      const created = await User.create(
        { roleId: role.id, firstName, lastName, email, passwordHash, status: USER_STATUS.ACTIVE },
        { transaction },
      );
      await audit.log({ userId: created.id, action: 'application.sign_up', entityType: 'User', entityId: created.id, req, transaction });
      return created;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return null; // lost a race with the same email
    throw err;
  }

  const verificationToken = await issueVerificationToken(user.id);
  await sendVerificationEmail(user.email, verificationToken);
  return { userId: user.id, verificationToken };
};

/** Departments with their programmes, for the application form. */
export const options = async () => {
  const departments = await Department.findAll({
    attributes: ['id', 'name', 'code'],
    include: [{ model: Program, as: 'programs', attributes: ['id', 'name', 'code', 'durationYears', 'qualificationCode'] }],
    order: [['name', 'ASC'], [{ model: Program, as: 'programs' }, 'name', 'ASC']],
  });
  return departments.map((d) => ({
    ...d.toJSON(),
    programs: d.programs.map((p) => ({ ...p.toJSON(), levels: Array.from({ length: p.durationYears }, (_, i) => (i + 1) * 100) })),
  }));
};

/** The signed-in applicant's application (or null), plus whether their email is verified yet. */
export const getMine = async (userId) => {
  const [application, user] = await Promise.all([
    AdmissionApplication.findOne({ where: { userId }, include: detailInclude.filter((i) => i.as !== 'reviewer') }),
    User.findByPk(userId, { attributes: ['emailVerifiedAt'] }),
  ]);
  return { application, emailVerified: Boolean(user?.emailVerifiedAt) };
};

/** Creates or updates the applicant's draft. Only a draft can change; submitted ones are with the admissions office. */
export const saveDraft = async (userId, data, req) => {
  await sequelize.transaction(async (transaction) => {
    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    let application = await AdmissionApplication.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (application && application.status !== DRAFT) {
      throw new ConflictError(`Your application has been ${application.status} and can no longer be changed`);
    }

    const next = { ...(application?.get() ?? {}), ...data };
    const program = await checkChoice(next, transaction);
    const fields = { ...data, ...(program ? { departmentId: program.departmentId } : {}) };

    if (application) {
      await application.update(fields, { transaction });
    } else {
      application = await AdmissionApplication.create({
        firstName: user.firstName, lastName: user.lastName, ...fields, userId, personalEmail: user.email,
      }, { transaction });
    }
    await audit.log({ userId, action: 'application.save', entityType: 'AdmissionApplication', entityId: application.id, req, transaction });
  });
  return getMine(userId);
};

const REQUIRED_TO_SUBMIT = {
  firstName: 'first name', lastName: 'last name', dateOfBirth: 'date of birth', phone: 'phone number',
  departmentId: 'department', programId: 'programme', entryLevel: 'entry level',
};

export const submit = async (userId, req) => {
  await sequelize.transaction(async (transaction) => {
    const application = await AdmissionApplication.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!application) throw new BadRequestError('Fill in your application first');
    if (application.status !== DRAFT) throw new ConflictError(`Your application has already been ${application.status}`);

    const user = await User.findByPk(userId, { attributes: ['emailVerifiedAt'], transaction });
    if (!user.emailVerifiedAt) {
      throw new BadRequestError('Confirm your email address first — we send your admission decision there');
    }
    const missing = Object.entries(REQUIRED_TO_SUBMIT).filter(([key]) => !application[key]).map(([, label]) => label);
    if (missing.length) throw new BadRequestError(`Still missing: ${missing.join(', ')}`, { missing });
    await checkChoice(application, transaction);

    await application.update({ status: SUBMITTED, submittedAt: new Date() }, { transaction });
    await audit.log({ userId, action: 'application.submit', entityType: 'AdmissionApplication', entityId: application.id, req, transaction });
  });
  return getMine(userId);
};

// ── reviewers ────────────────────────────────────────────────────────────────

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['submittedAt', 'createdAt', 'lastName'], ['submittedAt', 'ASC']);
  const where = {};
  // Drafts are the applicant's own business until submitted.
  where.status = query.status ?? { [Op.ne]: DRAFT };
  if (query.programId) where.programId = query.programId;
  if (query.search) {
    const like = `%${query.search}%`;
    where[Op.or] = [
      { firstName: { [Op.like]: like } },
      { lastName: { [Op.like]: like } },
      { personalEmail: { [Op.like]: like } },
    ];
  }
  const result = await AdmissionApplication.findAndCountAll({
    where,
    include: [programInclude, { model: Student, as: 'student', attributes: ['id', 'studentNumber'] }],
    limit, offset, order, distinct: true,
  });
  return { result, page, limit };
};

export const getById = async (id) => {
  const application = await AdmissionApplication.findByPk(id, { include: detailInclude });
  if (!application || application.status === DRAFT) throw new NotFoundError('Application');
  return application;
};

const lockSubmitted = async (id, transaction) => {
  const application = await AdmissionApplication.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
  if (!application || application.status === DRAFT) throw new NotFoundError('Application');
  if (application.status !== SUBMITTED) {
    throw new ConflictError(`Only submitted applications can be reviewed (this one is ${application.status})`);
  }
  return application;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

/**
 * The admission confirmation + activation email, as plain text and HTML (table layout and inline
 * styles, which is what email clients render reliably). It never contains a PIN or password: the
 * student chooses their PIN on the activation page. Exported for tests.
 */
export const admissionEmail = ({
  institution, firstName, lastName, programName, departmentName, level, studentNumber, schoolEmail, link, hours,
}) => {
  const name = [firstName, lastName].filter(Boolean).join(' ');
  const rows = [
    ['Student ID', studentNumber],
    ['Programme', programName],
    ...(departmentName ? [['Department', departmentName]] : []),
    ['Level', level],
    ['School email', schoolEmail],
  ];
  const text = `Dear ${name},\n\nCongratulations! You have been admitted to ${institution}.\n\n`
    + `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n`
    + 'Activate your student account to choose your PIN. The link works once and expires in '
    + `${hours} hours:\n\n${link}\n\n`
    + 'After activating, sign in with your Student ID and your new PIN. Your school email is created for you; '
    + 'keep using this personal address until you have access to it.\n\n'
    + 'If the link has expired or has already been used, contact the admissions office for a new one. '
    + "If you didn't apply for admission, you can ignore this email.";

  const e = escapeHtml;
  const cell = 'padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;';
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1d4ed8;padding:20px 28px;color:#ffffff;font-size:18px;font-weight:bold;">${e(institution)}</td></tr>
  <tr><td style="padding:28px;">
    <p style="margin:0 0 12px;font-size:16px;">Dear ${e(name)},</p>
    <p style="margin:0 0 20px;font-size:15px;line-height:1.5;"><strong>Congratulations!</strong> You have been admitted to ${e(institution)}. Your student record is ready:</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:6px;margin:0 0 24px;">
      ${rows.map(([k, v]) => `<tr><td style="${cell}color:#64748b;width:40%;">${e(k)}</td><td style="${cell}font-weight:bold;">${e(v)}</td></tr>`).join('')}
    </table>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Activate your student account to choose the PIN you will sign in with:</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="border-radius:6px;background:#1d4ed8;">
      <a href="${e(link)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Activate Student Account</a>
    </td></tr></table>
    <p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.5;">This link works <strong>once</strong> and expires in <strong>${e(hours)} hours</strong>. After activating, sign in with your Student ID and your new PIN.</p>
    <p style="margin:0 0 8px;font-size:13px;color:#475569;line-height:1.5;">If the button doesn't work, copy this address into your browser:<br><span style="word-break:break-all;color:#1d4ed8;">${e(link)}</span></p>
    <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;line-height:1.5;">If the link has expired or was already used, contact the admissions office for a new one. If you didn't apply for admission, you can ignore this email.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: `Admission to ${institution}: activate your student account`, text, html };
};

// Tests may route admission emails through a nodemailer transport (e.g. jsonTransport); normally unset,
// so email.service's configured transporter is used. It only ever feeds sendMail's own `transporter` seam.
let testTransporter;
export const useTransporterForTests = (transporter) => {
  testTransporter = transporter;
};

/**
 * Sends the admission email to the personal address and records the attempt on the application.
 * Never throws: a failed send leaves the admission in place and shows as `activationEmailError`
 * for the admin, who can resend.
 */
const sendAdmissionEmail = async (application, { studentNumber, schoolEmail, program, level }, token) => {
  const [institution, department] = await Promise.all([
    settingService.get('institution.name'),
    program.departmentId ? Department.findByPk(program.departmentId, { attributes: ['name'] }) : null,
  ]);
  const message = admissionEmail({
    institution,
    firstName: application.firstName,
    lastName: application.lastName,
    programName: program.name,
    departmentName: department?.name,
    level,
    studentNumber,
    schoolEmail,
    link: activationLink(token),
    hours: env.ACTIVATION_EXPIRES_HOURS,
  });
  const result = await emailService.sendMail(
    { to: application.personalEmail, ...message },
    testTransporter ? { transporter: testTransporter } : undefined,
  );

  const now = new Date();
  const error = result.sent ? null : String(result.error ?? 'The email could not be sent').slice(0, 255);
  await AdmissionApplication.update(
    {
      activationEmailAttempts: sequelize.literal('activation_email_attempts + 1'),
      activationEmailLastAttemptAt: now,
      activationEmailError: error,
      ...(result.sent ? { activationEmailSentAt: now } : {}),
    },
    { where: { id: application.id } },
  ).catch(() => {}); // recording is best effort; the admission itself is already committed
  return { sent: Boolean(result.sent), error };
};

const newActivation = () => {
  const token = generateOpaqueToken();
  return {
    token,
    fields: { activationHash: hashToken(token), activationExpires: new Date(Date.now() + env.ACTIVATION_EXPIRES_HOURS * 3600 * 1000) },
  };
};

/**
 * Admits a submitted application: creates the student record (Student ID, school email, programme,
 * level), converts the applicant's account into a pending student account and emails the activation
 * link. `programId`/`level`/`admissionSession` let the reviewer adjust the offer.
 */
export const admit = async (id, { programId, level, admissionSession } = {}, actor, req) => {
  const { application, identity, token } = await sequelize.transaction(async (transaction) => {
    const app = await lockSubmitted(id, transaction);
    const ctx = { domain: await studentEmailDomain(transaction) };

    const entryLevel = level ?? app.entryLevel;
    const program = await checkChoice({ programId: programId ?? app.programId, entryLevel }, transaction);
    if (!program) throw new BadRequestError('The application has no programme');

    const user = await User.findByPk(app.userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (await Student.findOne({ where: { userId: user.id }, attributes: ['id'], transaction })) {
      throw new ConflictError('This applicant already has a student record');
    }

    const session = admissionSession ?? await defaultSession(transaction);
    const { student, email } = await assignStudentIdentity(user, {
      firstName: app.firstName,
      lastName: app.lastName,
      level: entryLevel,
      admissionSession: session,
      // Ties the student record to its application; unique, so it can never be admitted twice.
      admissionNumber: `APP${String(app.id).padStart(6, '0')}`,
    }, program, ctx, transaction);

    const activation = newActivation();
    await user.update({
      roleId: await studentRoleId(ctx, transaction),
      firstName: app.firstName,
      lastName: app.lastName,
      email,
      // No usable credential until the student activates and chooses a PIN.
      passwordHash: UNUSABLE_PASSWORD_HASH,
      status: USER_STATUS.PENDING,
      mustChangePassword: false,
      emailVerifiedAt: new Date(), // the school owns the new mailbox
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...activation.fields,
    }, { transaction });
    // The applicant session (APPLICANT role, personal email) must not survive the change of role.
    await sessionService.endAllSessions(user.id, transaction);

    await app.update({
      status: ADMITTED,
      programId: program.id,
      departmentId: program.departmentId,
      entryLevel,
      admissionSession: session,
      studentId: student.id,
      reviewedBy: actor.id,
      reviewedAt: new Date(),
      rejectionReason: null,
    }, { transaction });

    await audit.log({
      userId: actor.id, action: 'application.admit', entityType: 'AdmissionApplication', entityId: app.id,
      metadata: { studentId: student.id, studentNumber: student.studentNumber, programId: program.id, level: entryLevel }, req, transaction,
    });
    return {
      application: app,
      identity: { studentNumber: student.studentNumber, schoolEmail: email, program, level: entryLevel },
      token: activation.token,
    };
  });

  // After commit: a failed send never undoes the admission; it is recorded for the admin to resend.
  const emailDelivery = await sendAdmissionEmail(application, identity, token);
  return { application: await getById(application.id), emailDelivery, activationToken: token };
};

export const reject = async (id, { reason } = {}, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const app = await lockSubmitted(id, transaction);
    await app.update({ status: REJECTED, rejectionReason: reason ?? null, reviewedBy: actor.id, reviewedAt: new Date() }, { transaction });
    // The applicant's account email is their personal email, so the notification's email reaches them there.
    await notificationService.create({
      userId: app.userId,
      type: 'APPLICATION_REJECTED',
      title: 'Admission decision',
      message: `We're sorry — your application for admission was not successful.${reason ? ` Reason: ${reason}` : ''}`,
      data: { applicationId: app.id },
    }, { transaction });
    await audit.log({
      userId: actor.id, action: 'application.reject', entityType: 'AdmissionApplication', entityId: app.id, metadata: { reason }, req, transaction,
    });
  });
  return getById(id);
};

/**
 * A new activation link for an admitted student who hasn't activated yet; the previous link stops
 * working. Never creates a student record. After a successful send, at most one more per
 * RESEND_COOLDOWN_MS, claimed with a conditional update so parallel clicks can't both send.
 */
export const resendActivation = async (id, actor, req) => {
  const application = await AdmissionApplication.findByPk(id, {
    include: [programInclude, { model: Student, as: 'student', attributes: ['id', 'studentNumber', 'level'] }],
  });
  if (!application || application.status !== ADMITTED) throw new ConflictError('Only admitted applications have an activation link');
  const user = await User.findByPk(application.userId);
  if (user.status !== USER_STATUS.PENDING) throw new ConflictError('This student has already activated their account');

  // Claimed under a row lock (not a conditional UPDATE: MySQL reports 0 changed rows when a send in
  // the same second wrote the same timestamp), so parallel clicks can't both send.
  await sequelize.transaction(async (transaction) => {
    const row = await AdmissionApplication.findByPk(id, {
      attributes: ['id', 'activationEmailLastAttemptAt', 'activationEmailError'], transaction, lock: transaction.LOCK.UPDATE,
    });
    const last = row.activationEmailLastAttemptAt;
    // The cooldown follows a successful send only: after a failure the admin may retry at once
    // (the route's resendLimiter still caps attempts).
    if (last && !row.activationEmailError && Date.now() - last.getTime() < RESEND_COOLDOWN_MS) {
      throw new TooManyAttemptsError(
        `An activation email was sent less than ${RESEND_COOLDOWN_MS / 1000} seconds ago. Wait a moment before resending.`,
        'RESEND_COOLDOWN',
      );
    }
    await row.update({ activationEmailLastAttemptAt: new Date(), activationEmailError: null }, { transaction });
  });

  const activation = newActivation();
  await User.update(activation.fields, { where: { id: user.id } });
  await audit.log({ userId: actor.id, action: 'application.resend_activation', entityType: 'AdmissionApplication', entityId: id, req });
  const emailDelivery = await sendAdmissionEmail(application, {
    studentNumber: application.student.studentNumber, schoolEmail: user.email, program: application.program, level: application.student.level,
  }, activation.token);
  return { emailDelivery, activationToken: activation.token };
};

// ── activation (public) ──────────────────────────────────────────────────────

/** Single use: the token is cleared in the same transaction that sets the PIN and activates the account. */
export const activate = async ({ token, pin }, req) => sequelize.transaction(async (transaction) => {
  const user = await User.scope('withSecrets').findOne({
    where: { activationHash: hashToken(token), activationExpires: { [Op.gt]: new Date() }, status: USER_STATUS.PENDING },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!user) throw new BadRequestError('This activation link is invalid or has expired. Ask the admissions office for a new one.');

  const student = await Student.findOne({ where: { userId: user.id }, attributes: ['studentNumber'], transaction });
  const problem = pinProblem(pin, { studentNumber: student?.studentNumber });
  if (problem) throw new BadRequestError(problem);

  await user.update({
    passwordHash: await hashPassword(pin),
    status: USER_STATUS.ACTIVE,
    activationHash: null,
    activationExpires: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
  }, { transaction });
  await AdmissionApplication.update({ accountActivatedAt: new Date() }, { where: { userId: user.id }, transaction });
  await audit.log({ userId: user.id, action: 'auth.activate', entityType: 'User', entityId: user.id, req, transaction });
  return { studentNumber: student?.studentNumber, schoolEmail: user.email };
});
