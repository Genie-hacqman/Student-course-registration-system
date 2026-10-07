import crypto from 'node:crypto';
import { Op, UniqueConstraintError } from 'sequelize';
import {
  sequelize, User, Role, Student, Program, Department, AdmissionApplication, AcademicYear, Semester,
} from '../models/index.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { photoEditable } from '../models/AdmissionApplication.js';
import { normalizeOfficialPhoto, squareDataUrl, squareJpeg } from '../utils/image.js';
import * as storage from './storage.service.js';
import { AppError, BadRequestError, ConflictError, NotFoundError, TooManyAttemptsError } from '../utils/errors.js';
import { APPLICATION_STATUS, ORG_STATUS, ROLES, USER_STATUS } from '../utils/constants.js';
import { hashPassword, UNUSABLE_PASSWORD_HASH } from '../utils/password.js';
import { generateOpaqueToken, hashToken } from '../utils/jwt.js';
import { pinProblem } from '../utils/pin.js';
import { buildPagination } from '../utils/pagination.js';
import { assignStudentIdentity, studentEmailDomain } from './admission.service.js';
import { issueVerificationToken, sendVerificationEmail } from './auth.service.js';
import * as sessionService from './session.service.js';
import * as notificationService from './notification.service.js';
import * as emailService from './email.service.js';
import * as templates from './email/templates.js';
import { sendTemplate, tokenKey } from './mail.service.js';
import * as settingService from './setting.service.js';
import { isOpen } from './org-status.service.js';
import * as audit from './audit.service.js';

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

export const RESEND_COOLDOWN_MS = 60 * 1000;

const maxLevelFor = (program) => program.durationYears * 100;

const checkChoice = async ({ departmentId, programId, entryLevel }, transaction) => {
  if (!programId) return null;
  const program = await Program.findByPk(programId, {
    include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'status'] }],
    transaction,
  });
  if (!program) throw new BadRequestError('Choose one of the listed programmes');
  if (!isOpen(program)) throw new ConflictError(`${program.name} is no longer accepting applications. Choose another programme.`);
  if (departmentId && departmentId !== program.departmentId) {
    throw new BadRequestError(`${program.name} is not offered by the chosen department`);
  }
  if (entryLevel && (entryLevel % 100 !== 0 || entryLevel > maxLevelFor(program))) {
    throw new BadRequestError(`${program.name} admits at levels 100 to ${maxLevelFor(program)}`);
  }
  return program;
};

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

export const signUp = async ({ firstName, lastName, email, password }, req) => {
  const [existingUser, existingApplication] = await Promise.all([
    User.findOne({ where: { email }, attributes: ['id'] }),
    AdmissionApplication.findOne({ where: { personalEmail: email }, attributes: ['id'] }),
  ]);
  if (existingUser || existingApplication) return null;

  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await sequelize.transaction(async (transaction) => {
      const role = await Role.findOne({ where: { name: ROLES.STUDENT }, transaction });
      if (!role) throw new Error('STUDENT role missing — run the seeders');
      const created = await User.create(
        { roleId: role.id, firstName, lastName, email, passwordHash, status: USER_STATUS.ACTIVE },
        { transaction },
      );
      await audit.log({ userId: created.id, action: 'application.sign_up', entityType: 'User', entityId: created.id, req, transaction });
      return created;
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return null;
    throw err;
  }

  const verificationToken = await issueVerificationToken(user.id);
  await sendVerificationEmail(user, verificationToken);
  return { userId: user.id, verificationToken };
};

export const options = async () => {
  const departments = await Department.findAll({
    where: { status: ORG_STATUS.ACTIVE },
    attributes: ['id', 'name', 'code'],
    include: [{
      model: Program, as: 'programs', required: false, where: { status: ORG_STATUS.ACTIVE },
      attributes: ['id', 'name', 'code', 'durationYears', 'qualificationCode'],
    }],
    order: [['name', 'ASC'], [{ model: Program, as: 'programs' }, 'name', 'ASC']],
  });
  return departments.map((d) => ({
    ...d.toJSON(),
    programs: d.programs.map((p) => ({ ...p.toJSON(), levels: Array.from({ length: p.durationYears }, (_, i) => (i + 1) * 100) })),
  }));
};

export const getMine = async (userId) => {
  const [application, user] = await Promise.all([
    AdmissionApplication.findOne({ where: { userId }, include: detailInclude.filter((i) => i.as !== 'reviewer') }),
    User.findByPk(userId, { attributes: ['emailVerifiedAt'] }),
  ]);
  return { application, emailVerified: Boolean(user?.emailVerifiedAt) };
};

export const saveDraft = async (userId, data, req) => {
  await sequelize.transaction(async (transaction) => {
    let application = await AdmissionApplication.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE });
    if (await Student.findOne({ where: { userId }, attributes: ['id'], transaction })) {
      throw new ConflictError('You are already admitted; there is no application to fill in');
    }
    if (application && application.status !== DRAFT) {
      throw new ConflictError(`Your application has been ${application.status} and can no longer be changed`);
    }

    const next = { ...(application?.get() ?? {}), ...data };
    const program = await checkChoice(next, transaction);
    const fields = { ...data, ...(program ? { departmentId: program.departmentId } : {}) };

    if (application) {
      await application.update(fields, { transaction });
    } else {
      const user = await User.findByPk(userId, { attributes: ['firstName', 'lastName', 'email'], transaction });
      try {
        application = await AdmissionApplication.create({
          firstName: user.firstName, lastName: user.lastName, ...fields, userId, personalEmail: user.email,
        }, { transaction });
      } catch (err) {
        if (err instanceof UniqueConstraintError) throw new ConflictError('Your application is being saved elsewhere. Please try again.');
        throw err;
      }
    }
    await audit.log({ userId, action: 'application.save', entityType: 'AdmissionApplication', entityId: application.id, req, transaction });
  });
  return getMine(userId);
};

export const applicationNumber = (id) => `APP${String(id).padStart(6, '0')}`;

const PHOTO_LOCKED_MESSAGE = 'The official application photo is locked once your application is submitted and can no longer be changed';

const assertPhotoEditable = (application) => {
  if (!photoEditable(application)) throw new ConflictError(PHOTO_LOCKED_MESSAGE, { code: 'PHOTO_LOCKED' });
};

const photoKeyFor = (application) =>
  `applications/${new Date().getUTCFullYear()}/${application.id}/official-photo/${crypto.randomUUID()}.jpg`;

const lockOwnApplication = async (userId, transaction) => {
  const found = await AdmissionApplication.findOne({ where: { userId }, transaction, lock: transaction.LOCK.UPDATE });
  if (found) return found;
  if (await Student.findOne({ where: { userId }, attributes: ['id'], transaction })) {
    throw new ConflictError('You are already admitted; there is no application to fill in');
  }
  const user = await User.findByPk(userId, { attributes: ['firstName', 'lastName', 'email'], transaction });
  try {
    return await AdmissionApplication.create({
      firstName: user.firstName, lastName: user.lastName, userId, personalEmail: user.email,
    }, { transaction });
  } catch (err) {
    if (err instanceof UniqueConstraintError) throw new ConflictError('Your application is being saved elsewhere. Please try again.');
    throw err;
  }
};

const discard = (key) => storage.remove(key).catch((err) => logger.warn(`Could not delete stored photo ${key}: ${err.message}`));

export const setPhoto = async (userId, { body, contentType }, req) => {
  storage.assertConfigured();
  const photo = await normalizeOfficialPhoto(body, contentType);

  let newKey = null;
  let oldKey = null;
  try {
    await sequelize.transaction(async (transaction) => {
      const application = await lockOwnApplication(userId, transaction);
      assertPhotoEditable(application);
      oldKey = application.photoKey;
      newKey = photoKeyFor(application);
      await storage.put(newKey, photo.buffer, 'image/jpeg');
      await application.update({ photoKey: newKey, photoSha256: photo.sha256, photoUploadedAt: new Date() }, { transaction });
      await audit.log({
        userId, action: oldKey ? 'application.photo_replace' : 'application.photo_upload', entityType: 'AdmissionApplication',
        entityId: application.id, metadata: { sha256: photo.sha256 }, req, transaction,
      });
    });
  } catch (err) {
    if (newKey) await discard(newKey);
    throw err;
  }
  if (oldKey) await discard(oldKey);
  return getMine(userId);
};

export const removePhoto = async (userId, req) => {
  storage.assertConfigured();
  let oldKey = null;
  await sequelize.transaction(async (transaction) => {
    const application = await lockOwnApplication(userId, transaction);
    assertPhotoEditable(application);
    if (!application.photoKey) throw new NotFoundError('Photo');
    oldKey = application.photoKey;
    await application.update({ photoKey: null, photoSha256: null, photoUploadedAt: null }, { transaction });
    await audit.log({ userId, action: 'application.photo_remove', entityType: 'AdmissionApplication', entityId: application.id, req, transaction });
  });
  await discard(oldKey);
  return getMine(userId);
};

const THUMB_SIDE = 96;

const readPhoto = async (application, size = 'full') => {
  if (!application?.photoKey) throw new NotFoundError('Photo');
  let bytes;
  try {
    bytes = await storage.get(application.photoKey);
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error(`Could not read the official photo of application ${application.id}: ${err.name ?? 'Error'}: ${err.message}`);
    throw new AppError('The photo could not be loaded from storage right now. Please try again shortly.', 503, 'PHOTO_UNAVAILABLE');
  }
  if (!bytes) throw new NotFoundError('Photo');
  return size === 'thumb' ? squareJpeg(bytes, THUMB_SIDE, 80) : bytes;
};

export const getMyPhoto = async (userId) =>
  readPhoto(await AdmissionApplication.findOne({ where: { userId }, attributes: ['id', 'photoKey'] }));

export const getPhotoForReview = async (id, size) => {
  const application = await AdmissionApplication.findByPk(id, { attributes: ['id', 'status', 'photoKey'] });
  if (!application || application.status === DRAFT) throw new NotFoundError('Application');
  return readPhoto(application, size);
};

const studentApplication = async (studentId, options = {}) => {
  if (!await Student.findByPk(studentId, { attributes: ['id'] })) throw new NotFoundError('Student');
  const application = await AdmissionApplication.findOne({ where: { studentId }, ...options });
  if (!application) throw new AppError('This student has no online application (admitted by staff)', 404, 'NO_APPLICATION');
  return application;
};

export const getForStudent = async (studentId) => {
  const application = await studentApplication(studentId, {
    include: [
      programInclude,
      { model: Department, as: 'department', attributes: ['id', 'name', 'code'] },
      { model: User, as: 'reviewer', attributes: ['id', 'firstName', 'lastName'] },
    ],
  });
  return { ...application.toJSON(), applicationNumber: applicationNumber(application.id) };
};

export const getPhotoForStudent = async (studentId, size) =>
  readPhoto(await studentApplication(studentId, { attributes: ['id', 'photoKey'] }), size);

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
    if (!application.photoKey) missing.push('official application photo');
    if (missing.length) throw new BadRequestError(`Still missing: ${missing.join(', ')}`, { missing });
    await checkChoice(application, transaction);

    const now = new Date();
    await application.update({ status: SUBMITTED, submittedAt: now, photoLockedAt: now }, { transaction });
    await audit.log({
      userId, action: 'application.submit', entityType: 'AdmissionApplication', entityId: application.id,
      metadata: { photoLocked: true, photoSha256: application.photoSha256 }, req, transaction,
    });

    const program = await Program.findByPk(application.programId, { attributes: ['name'], transaction });
    const reviewers = await User.findAll({
      where: { status: USER_STATUS.ACTIVE },
      include: [{ model: Role, as: 'role', where: { name: ROLES.ADMIN }, attributes: [] }],
      attributes: ['id'],
      transaction,
    });
    await notificationService.createMany({
      userIds: reviewers.map((r) => r.id),
      type: 'APPLICATION_SUBMITTED',
      title: 'New admission application',
      message: `${application.firstName} ${application.lastName} applied for ${program?.name ?? 'a programme'} (level ${application.entryLevel}).`,
      data: { applicationId: application.id },
    }, { transaction });
  });
  return getMine(userId);
};

export const list = async (query) => {
  const { page, limit, offset, order } = buildPagination(query, ['submittedAt', 'createdAt', 'lastName'], ['submittedAt', 'ASC']);
  const where = {};
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

export const admissionEmail = ({
  institution, firstName, lastName, programName, departmentName, level, studentNumber, schoolEmail, link, hours,
}) => templates.accountActivation({
  name: [firstName, lastName].filter(Boolean).join(' '),
  studentNumber, programName, departmentName, level, schoolEmail, activationUrl: link, hours,
}, { school: institution, frontendUrl: env.FRONTEND_URL });

export const useTransporterForTests = (transporter) => {
  emailService.setEmailProviderForTests(transporter ? emailService.smtpProvider(transporter) : undefined);
};

const sendAdmissionEmail = async (application, { studentNumber, schoolEmail, program, level }, token) => {
  const department = program.departmentId ? await Department.findByPk(program.departmentId, { attributes: ['name'] }) : null;
  const result = await sendTemplate('accountActivation', {
    name: [application.firstName, application.lastName].filter(Boolean).join(' '),
    programName: program.name,
    departmentName: department?.name,
    level,
    studentNumber,
    schoolEmail,
    activationUrl: activationLink(token),
    hours: env.ACTIVATION_EXPIRES_HOURS,
  }, {
    to: application.personalEmail,
    idempotencyKey: `activation:${application.userId}:${tokenKey(hashToken(token))}`,
    userId: application.userId,
    entityType: 'AdmissionApplication',
    entityId: application.id,
  });

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
  ).catch(() => {});
  return { sent: Boolean(result.sent), error };
};

const newActivation = () => {
  const token = generateOpaqueToken();
  return {
    token,
    fields: { activationHash: hashToken(token), activationExpires: new Date(Date.now() + env.ACTIVATION_EXPIRES_HOURS * 3600 * 1000) },
  };
};

const startingProfilePicture = async (app, userId, transaction) => {
  if (!app.photoKey) return {};
  if (await User.count({ where: { id: userId, avatar: { [Op.ne]: null } }, transaction })) return {};
  try {
    const bytes = await storage.get(app.photoKey);
    if (!bytes) return {};
    return {
      avatar: await squareDataUrl(bytes, 256),
      avatarThumb: await squareDataUrl(bytes, 48, 80),
      avatarUpdatedAt: new Date(),
    };
  } catch (err) {
    logger.warn(`Could not copy the application photo into application ${app.id}'s profile picture: ${err.message}`);
    return {};
  }
};

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
      admissionNumber: applicationNumber(app.id),
    }, program, ctx, transaction);

    const activation = newActivation();
    const profilePicture = await startingProfilePicture(app, user.id, transaction);
    await user.update({
      ...profilePicture,
      firstName: app.firstName,
      lastName: app.lastName,
      email,
      passwordHash: UNUSABLE_PASSWORD_HASH,
      status: USER_STATUS.PENDING,
      mustChangePassword: false,
      emailVerifiedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...activation.fields,
    }, { transaction });
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

  const emailDelivery = await sendAdmissionEmail(application, identity, token);
  return { application: await getById(application.id), emailDelivery, activationToken: token };
};

export const reject = async (id, { reason } = {}, actor, req) => {
  await sequelize.transaction(async (transaction) => {
    const app = await lockSubmitted(id, transaction);
    await app.update({ status: REJECTED, rejectionReason: reason ?? null, reviewedBy: actor.id, reviewedAt: new Date() }, { transaction });
    await notificationService.create({
      userId: app.userId,
      type: 'APPLICATION_REJECTED',
      title: 'Admission decision',
      message: `We're sorry — your application for admission was not successful.${reason ? ` Reason: ${reason}` : ''}`,
      data: { applicationId: app.id, ...(reason ? { reason } : {}) },
    }, { transaction });
    await audit.log({
      userId: actor.id, action: 'application.reject', entityType: 'AdmissionApplication', entityId: app.id, metadata: { reason }, req, transaction,
    });
  });
  return getById(id);
};

export const resendActivation = async (id, actor, req) => {
  const application = await AdmissionApplication.findByPk(id, {
    include: [programInclude, { model: Student, as: 'student', attributes: ['id', 'studentNumber', 'level'] }],
  });
  if (!application || application.status !== ADMITTED) throw new ConflictError('Only admitted applications have an activation link');
  const user = await User.findByPk(application.userId);
  if (user.status !== USER_STATUS.PENDING) throw new ConflictError('This student has already activated their account');

  await sequelize.transaction(async (transaction) => {
    const row = await AdmissionApplication.findByPk(id, {
      attributes: ['id', 'activationEmailLastAttemptAt', 'activationEmailError'], transaction, lock: transaction.LOCK.UPDATE,
    });
    const last = row.activationEmailLastAttemptAt;
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

export const activate = async ({ token, pin }, req) => sequelize.transaction(async (transaction) => {
  const user = await User.scope('withSecrets').findOne({
    where: { activationHash: hashToken(token), activationExpires: { [Op.gt]: new Date() }, status: USER_STATUS.PENDING },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (!user) {
    await audit.log({ action: 'security.token_invalid', req, metadata: { kind: 'activation', reason: 'invalid_or_expired' } });
    throw new BadRequestError('This activation link is invalid or has expired. Ask the admissions office for a new one.');
  }

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
