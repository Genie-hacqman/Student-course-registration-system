import { createHmac, timingSafeEqual, randomInt } from 'node:crypto';
import { sequelize, User, Student, Role } from '../models/index.js';
import env from '../config/env.js';
import { hashPassword, hashTemporaryPin, comparePassword } from '../utils/password.js';
import { pinProblem, generatePin } from '../utils/pin.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/errors.js';
import { ROLES, USER_STATUS } from '../utils/constants.js';
import * as sessionService from './session.service.js';
import * as emailService from './email.service.js';
import * as audit from './audit.service.js';
import * as settingService from './setting.service.js';
import { issueTokens, loadProfile } from './auth.service.js';

/*
 * Student PINs. Students change and recover their own PIN without the super admin's approval
 * (staff passwords still need it): the PIN was issued by the school, and recovery goes through
 * the school email, which only the student can read.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MS = 60 * 1000;

// Keyed, so a leaked database alone can't be brute-forced back to live codes (10^6 possibilities).
const hashOtp = (userId, otp) => createHmac('sha256', env.JWT_ACCESS_SECRET).update(`pin-otp:${userId}:${otp}`).digest('hex');

const assertPin = (pin, studentNumber) => {
  const problem = pinProblem(pin, { studentNumber });
  if (problem) throw new BadRequestError(problem);
};

const findStudentUser = (studentNumber) => User.scope('withSecrets').findOne({
  include: [{ model: Student, as: 'student', where: { studentNumber }, attributes: ['id', 'studentNumber'] }],
});

/** Stores a new PIN and ends every session. `mustChange` marks it temporary (staff-issued). */
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

/**
 * The signed-in student replaces their PIN (always required after admission or a staff reset).
 * Every session ends, then this device gets fresh tokens, so the student carries straight on.
 */
export const changePin = async (userId, { currentPin, newPin }, meta) => {
  const user = await User.scope('withSecrets').findByPk(userId, {
    include: [{ model: Student, as: 'student', attributes: ['studentNumber'] }, { model: Role, as: 'role' }],
  });
  if (!user) throw new NotFoundError('User');
  if (user.role.name !== ROLES.USER) throw new ForbiddenError('Only students have a PIN; staff change their password instead');
  if (!(await comparePassword(currentPin, user.passwordHash))) throw new BadRequestError('Current PIN is incorrect');
  if (currentPin === newPin) throw new BadRequestError('New PIN must differ from the current PIN');
  assertPin(newPin, user.student?.studentNumber);

  const tokens = await sequelize.transaction(async (transaction) => {
    await setPin(user, newPin, { mustChange: false, action: 'auth.change_pin', transaction });
    await user.reload({ transaction }); // endAllSessions bumped token_version; the new tokens must carry it
    return issueTokens(user, user.role.name, meta, transaction);
  });
  return { user: await loadProfile(user.id), ...tokens };
};

/**
 * Step 1 of "forgot PIN". Always resolves the same way, so it never reveals whether a student
 * exists or which email they have. Acts only when the email is that student's school email.
 * Returns the raw OTP for internal use (tests) only.
 */
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

  const institution = await settingService.get('institution.name');
  await emailService.sendMail({
    to: user.email,
    subject: `Your ${institution} PIN reset code`,
    text: `Your code to reset the PIN for ${user.student.studentNumber} is:\n\n${otp}\n\nIt expires in ${OTP_TTL_MS / 60000} minutes. If you didn't ask to reset your PIN, ignore this email; your PIN has not changed.`,
  });
  await audit.log({ userId: user.id, action: 'auth.pin_otp_sent', entityType: 'User', entityId: user.id });
  return otp;
};

/**
 * Step 2 of "forgot PIN": the emailed code sets a new PIN and ends every session.
 * A wrong code counts against the OTP (committed, not rolled back); the OTP_MAX_ATTEMPTS-th kills it.
 */
export const resetPinWithOtp = async ({ studentNumber, otp, newPin }) => {
  assertPin(newPin, studentNumber); // before touching the code, so a weak PIN doesn't burn an attempt

  const outcome = await sequelize.transaction(async (transaction) => {
    const student = await Student.findOne({ where: { studentNumber }, attributes: ['userId'], transaction });
    // Row lock: parallel guesses are counted one at a time.
    const user = student && await User.scope('withSecrets').findByPk(student.userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user?.pinOtpHash || user.pinOtpExpires <= new Date() || user.pinOtpAttempts >= OTP_MAX_ATTEMPTS) return 'invalid';

    if (!timingSafeEqual(Buffer.from(user.pinOtpHash, 'hex'), Buffer.from(hashOtp(user.id, otp), 'hex'))) {
      await user.update({ pinOtpAttempts: user.pinOtpAttempts + 1 }, { transaction });
      return 'invalid';
    }
    await setPin(user, newPin, { mustChange: false, action: 'auth.reset_pin', transaction });
    return 'ok';
  });
  if (outcome !== 'ok') throw new BadRequestError('The code is invalid or has expired. Request a new one.');
};

/**
 * Staff issue a new temporary PIN (the student lost it and can't use their school email).
 * The student must change it on next sign-in. Returns the PIN once; it is never stored in clear.
 */
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
