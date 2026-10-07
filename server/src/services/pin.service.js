import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { sequelize, User, Student, Role, AdmissionApplication } from '../models/index.js';
import env from '../config/env.js';
import { hashPassword, hashTemporaryPin, comparePassword } from '../utils/password.js';
import { pinProblem, generatePin } from '../utils/pin.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { ROLES, USER_STATUS } from '../utils/constants.js';
import * as sessionService from './session.service.js';
import { sendTemplate } from './mail.service.js';
import * as audit from './audit.service.js';
import { safeLoginIdentifier } from '../utils/redact.js';
import { issueTokens, loadProfile } from './auth.service.js';

const sendPinAlert = async (userId, { recovered }) => {
  const user = await User.findByPk(userId, { attributes: ['id', 'email', 'firstName', 'tokenVersion'] });
  const application = await AdmissionApplication.findOne({ where: { userId }, attributes: ['personalEmail'] });
  const to = [...new Set([user.email, application?.personalEmail].filter(Boolean))];
  await sendTemplate('pinChanged', { name: user.firstName, when: new Date().toUTCString(), recovered }, {
    to, idempotencyKey: `pinChanged:${user.id}:${user.tokenVersion}`, userId: user.id, entityType: 'User', entityId: user.id,
  });
};

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60 * 1000;

const hashOtp = (userId, otp) => createHmac('sha256', env.JWT_ACCESS_SECRET).update(`pin-otp:${userId}:${otp}`).digest('hex');

const assertPin = (pin, studentNumber) => {
  const problem = pinProblem(pin, { studentNumber });
  if (problem) throw new BadRequestError(problem);
};

const findStudentUser = (studentNumber) => User.scope('withSecrets').findOne({
  include: [{ model: Student, as: 'student', where: { studentNumber }, attributes: ['id', 'studentNumber'] }],
});

const setPin = async (user, pin, { mustChange, action, actorId, transaction }) => {
  await user.update({
    passwordHash: await (mustChange ? hashTemporaryPin(pin) : hashPassword(pin)),
    mustChangePassword: mustChange,
    failedLoginAttempts: 0,
    lockedUntil: null,
    pinOtpHash: null,
    pinOtpExpires: null,
    pinOtpAttempts: 0,
  }, { transaction });
  await sessionService.endAllSessions(user.id, transaction);
  await audit.log({ userId: actorId ?? user.id, action, entityType: 'User', entityId: user.id, transaction });
};

export const changePin = async (userId, { currentPin, newPin }, meta) => {
  const user = await User.scope('withSecrets').findByPk(userId, {
    include: [{ model: Student, as: 'student', attributes: ['studentNumber'] }, { model: Role, as: 'role' }],
  });
  if (!user) throw new NotFoundError('User');
  if (user.role.name !== ROLES.STUDENT || !user.student) {
    throw new ForbiddenError('Only admitted students have a PIN; everyone else changes their password instead');
  }
  if (!(await comparePassword(currentPin, user.passwordHash))) {
    await audit.log({ userId, action: 'security.credential_change_failed', entityType: 'User', entityId: userId, metadata: { kind: 'pin' } });
    throw new BadRequestError('Current PIN is incorrect');
  }
  if (currentPin === newPin) throw new BadRequestError('New PIN must differ from the current PIN');
  assertPin(newPin, user.student?.studentNumber);

  const wasTemporary = user.mustChangePassword;
  const tokens = await sequelize.transaction(async (transaction) => {
    await setPin(user, newPin, { mustChange: false, action: 'auth.change_pin', transaction });
    await user.reload({ transaction });
    return issueTokens(user, user.role.name, meta, transaction);
  });
  if (!wasTemporary) await sendPinAlert(user.id, { recovered: false });
  return { user: await loadProfile(user.id), ...tokens };
};

export const forgotPin = async ({ studentNumber, email }) => {
  const user = await findStudentUser(studentNumber);
  if (!user || user.status !== USER_STATUS.ACTIVE || user.email !== email) return null;
  if (user.pinOtpSentAt && Date.now() - user.pinOtpSentAt < OTP_RESEND_MS) return null;

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await user.update({
    pinOtpHash: hashOtp(user.id, otp),
    pinOtpExpires: new Date(Date.now() + OTP_TTL_MS),
    pinOtpAttempts: 0,
    pinOtpSentAt: new Date(),
  });

  await sendTemplate('pinResetCode', { studentNumber: user.student.studentNumber, code: otp, minutes: OTP_TTL_MS / 60000 }, {
    to: user.email, idempotencyKey: `pinResetCode:${user.id}:${user.pinOtpSentAt.getTime()}`, userId: user.id, entityType: 'User', entityId: user.id,
  });
  await audit.log({ userId: user.id, action: 'auth.pin_otp_sent', entityType: 'User', entityId: user.id });
  return otp;
};

export const resetPinWithOtp = async ({ studentNumber, otp, newPin }) => {
  assertPin(newPin, studentNumber);

  const outcome = await sequelize.transaction(async (transaction) => {
    const student = await Student.findOne({ where: { studentNumber }, attributes: ['userId'], transaction });
    const user = student && await User.scope('withSecrets').findByPk(student.userId, { transaction, lock: transaction.LOCK.UPDATE });

    const rejected = async (reason, extra = {}) => {
      await audit.log({
        userId: user?.id ?? null, action: 'security.pin_otp_failed', entityType: user ? 'User' : null, entityId: user?.id, transaction,
        metadata: { studentNumber: safeLoginIdentifier(studentNumber), reason, ...extra },
      });
      return 'invalid';
    };
    if (!user) return rejected('unknown_student');
    if (!user.pinOtpHash) return rejected('no_code_requested');
    if (user.pinOtpExpires <= new Date()) return rejected('expired');
    if (user.pinOtpAttempts >= OTP_MAX_ATTEMPTS) return rejected('too_many_attempts');

    if (!timingSafeEqual(Buffer.from(user.pinOtpHash, 'hex'), Buffer.from(hashOtp(user.id, otp), 'hex'))) {
      const attempts = user.pinOtpAttempts + 1;
      await user.update({ pinOtpAttempts: attempts }, { transaction });
      return rejected('wrong_code', { attempts, codeBurned: attempts >= OTP_MAX_ATTEMPTS });
    }
    await setPin(user, newPin, { mustChange: false, action: 'auth.reset_pin', transaction });
    return 'ok';
  });
  if (outcome !== 'ok') throw new BadRequestError('The code is invalid or has expired. Request a new one.');
  const student = await Student.findOne({ where: { studentNumber }, attributes: ['userId'] });
  await sendPinAlert(student.userId, { recovered: true });
};

export const issueTemporaryPin = async (studentId, actor) => {
  const student = await Student.findByPk(studentId, { attributes: ['id', 'userId', 'studentNumber'] });
  if (!student) throw new NotFoundError('Student');
  const user = await User.scope('withSecrets').findByPk(student.userId);
  const pin = generatePin({ studentNumber: student.studentNumber });
  await sequelize.transaction((transaction) => setPin(user, pin, {
    mustChange: true, action: 'student.pin_reset', actorId: actor.id, transaction,
  }));
  return { studentNumber: student.studentNumber, schoolEmail: user.email, pin };
};
