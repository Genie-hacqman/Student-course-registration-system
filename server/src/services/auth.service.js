import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import {
  sequelize, User, Role, Student, Lecturer, Program, Department, RefreshToken, AdmissionApplication,
} from '../models/index.js';
import env from '../config/env.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { signAccessToken, generateOpaqueToken, hashToken } from '../utils/jwt.js';
import {
  ConflictError, NotFoundError, UnauthorizedError, ForbiddenError, BadRequestError, TooManyAttemptsError,
} from '../utils/errors.js';
import { ROLES, USER_STATUS, ADMISSION_STATUS } from '../utils/constants.js';
import { permissionsFor } from './permission.service.js';
import * as audit from './audit.service.js';
import * as sessionService from './session.service.js';
import { sendTemplate, tokenKey } from './mail.service.js';
import { issuePasswordReset } from './password-reset.service.js';
import {
  requiresApproval, requestPasswordReset, hasPin, roleAndStudent,
} from './account-request.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Compared against when the email is unknown, so response time doesn't reveal whether an account exists.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5J8m7bY1qH1d5b0zjz1yQWf0rP9e8m2';

const APPLICATION_TO_ADMISSION = {
  submitted: ADMISSION_STATUS.PENDING,
  rejected: ADMISSION_STATUS.REJECTED,
  admitted: ADMISSION_STATUS.ADMITTED,
};

/** A STUDENT's admission state (never a role): ADMITTED with a student record, else from their application. */
export const admissionStatusOf = async (user) => {
  if (user.role?.name !== ROLES.STUDENT) return undefined;
  if (user.student) return ADMISSION_STATUS.ADMITTED;
  const application = await AdmissionApplication.findOne({ where: { userId: user.id }, attributes: ['status'] });
  return APPLICATION_TO_ADMISSION[application?.status] ?? ADMISSION_STATUS.NOT_SUBMITTED;
};

/** The signed-in user's profile plus their effective permissions (and a student's admission status). */
export const loadProfile = async (userId) => {
  const user = await findProfile(userId);
  if (!user) return user;
  const admissionStatus = await admissionStatusOf(user);
  return { ...user.toJSON(), permissions: permissionsFor(user.role?.name), ...(admissionStatus ? { admissionStatus } : {}) };
};

const findProfile = (userId) =>
  User.scope('withAvatar').findByPk(userId, {
    include: [
      { model: Role, as: 'role', attributes: ['id', 'name'] },
      {
        model: Student,
        as: 'student',
        include: [{
          model: Program,
          as: 'program',
          attributes: ['id', 'name', 'code', 'maxCredits', 'qualificationCode'],
          include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
        }],
      },
      {
        model: Lecturer,
        as: 'lecturer',
        include: [{ model: Department, as: 'department', attributes: ['id', 'name', 'code'] }],
      },
    ],
  });

export const issueTokens = async (user, roleName, meta = {}, transaction) => {
  const accessToken = signAccessToken({ id: user.id, role: roleName, tokenVersion: user.tokenVersion });
  const { jti, exp } = jwt.decode(accessToken);
  const refreshToken = generateOpaqueToken();
  const refreshExpiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * DAY_MS);

  await RefreshToken.create(
    {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: refreshExpiresAt,
      // Remembered so ending this one session can also cut off its current access token.
      accessJti: jti,
      accessExpiresAt: new Date(exp * 1000),
      userAgent: meta.userAgent?.slice(0, 255),
      ipAddress: meta.ip,
    },
    { transaction },
  );

  return { accessToken, refreshToken, refreshExpiresAt };
};

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

/** Stores a fresh verification token for the user and returns the raw value for the email link. */
export const issueVerificationToken = async (userId, transaction) => {
  const token = generateOpaqueToken();
  await User.update(
    { emailVerificationHash: hashToken(token), emailVerificationExpires: new Date(Date.now() + VERIFICATION_TTL_MS) },
    { where: { id: userId }, transaction },
  );
  return token;
};

/** `user` needs id, email and firstName. Keyed on the token, so a retried request doesn't send twice. */
export const sendVerificationEmail = (user, token) => sendTemplate('emailVerification', {
  name: user.firstName,
  verifyUrl: `${env.FRONTEND_URL}/verify-email?token=${token}`,
  hours: VERIFICATION_TTL_MS / 3_600_000,
}, { to: user.email, idempotencyKey: `verify:${user.id}:${tokenKey(hashToken(token))}`, userId: user.id, entityType: 'User', entityId: user.id });

const formatWhen = (date = new Date()) => date.toUTCString();

/** Security alert after a credential change; after commit, never blocking the change itself. */
export const sendCredentialAlert = (user, template, data = {}) => sendTemplate(template, {
  name: user.firstName, when: formatWhen(), ...data,
}, {
  to: user.email,
  // One alert per change: token_version is bumped by every credential change (endAllSessions).
  idempotencyKey: `${template}:${user.id}:${user.tokenVersion ?? Date.now()}`,
  userId: user.id,
  entityType: 'User',
  entityId: user.id,
});

// Sign-in lockout, per account (on top of the per-IP authLimiter): student PINs are only 6 digits.
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** Staff sign in with their email; students with their Student ID (or their school email). */
const findLoginUser = (identifier) => {
  const role = { model: Role, as: 'role' };
  if (identifier.includes('@')) {
    return User.scope('withSecrets').findOne({ where: { email: identifier.toLowerCase() }, include: [role] });
  }
  return User.scope('withSecrets').findOne({
    include: [role, { model: Student, as: 'student', where: { studentNumber: identifier }, attributes: ['id'] }],
  });
};

/**
 * Counts a failed attempt in one statement, so parallel guesses can't slip past the limit. The
 * MAX_FAILED_LOGINS-th failure locks the account for LOCKOUT_MS and starts the count again.
 */
const recordFailedLogin = (userId) => sequelize.query(
  `UPDATE users
      SET locked_until = IF(failed_login_attempts + 1 >= :max, :lockUntil, locked_until),
          failed_login_attempts = IF(failed_login_attempts + 1 >= :max, 0, failed_login_attempts + 1)
    WHERE id = :userId`,
  { replacements: { userId, max: MAX_FAILED_LOGINS, lockUntil: new Date(Date.now() + LOCKOUT_MS) } },
);

export const lockedMessage = (until) =>
  `Too many failed sign-in attempts. Try again in ${Math.max(1, Math.ceil((until - Date.now()) / 60000))} minute(s), or reset your PIN.`;

export const login = async ({ identifier, password }, meta) => {
  const user = await findLoginUser(identifier);
  const failure = identifier.includes('@') ? 'Invalid email or password' : 'Invalid student ID or PIN';

  if (user?.lockedUntil > new Date()) {
    await audit.log({ userId: user.id, action: 'auth.login_locked', metadata: { identifier, userAgent: meta.userAgent }, req: meta.req });
    throw new TooManyAttemptsError(lockedMessage(user.lockedUntil), 'ACCOUNT_LOCKED');
  }

  const valid = await comparePassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    if (user) await recordFailedLogin(user.id);
    await audit.log({ userId: user?.id, action: 'auth.login_failed', metadata: { email: identifier, userAgent: meta.userAgent }, req: meta.req });
    throw new UnauthorizedError(failure);
  }
  if (user.status !== USER_STATUS.ACTIVE) throw new ForbiddenError(`Account is ${user.status}`);

  const tokens = await issueTokens(user, user.role.name, meta);
  await user.update({ lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null });
  await audit.log({ userId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id, metadata: { userAgent: meta.userAgent }, req: meta.req });

  return { user: await loadProfile(user.id), ...tokens };
};

/**
 * Rotates the refresh token. A token can be used once: presenting one that was already rotated
 * (replaced by a newer token) is treated as theft, and every session for that user is revoked.
 * A token revoked by signing out — including a session ended from another device — is just rejected.
 */
export const refresh = async (rawToken, meta) => {
  if (!rawToken) throw new UnauthorizedError('Refresh token missing');

  const stored = await RefreshToken.findOne({ where: { tokenHash: hashToken(rawToken) } });
  if (!stored) throw new UnauthorizedError('Invalid refresh token');

  if (stored.revokedAt) {
    if (stored.replacedByHash) {
      await sequelize.transaction(async (transaction) => {
        await sessionService.endAllSessions(stored.userId, transaction);
        await audit.log({ userId: stored.userId, action: 'auth.refresh_reuse_detected', req: meta.req, transaction });
      });
    }
    throw new UnauthorizedError('Refresh token has been revoked');
  }
  if (stored.expiresAt <= new Date()) throw new UnauthorizedError('Refresh token expired');

  const user = await User.findByPk(stored.userId, { include: [{ model: Role, as: 'role' }] });
  if (!user || user.status !== USER_STATUS.ACTIVE) throw new UnauthorizedError('Account is not active');

  return sequelize.transaction(async (transaction) => {
    const tokens = await issueTokens(user, user.role.name, meta, transaction);

    // Conditional update guards against two concurrent refreshes with the same token.
    const [revoked] = await RefreshToken.update(
      { revokedAt: new Date(), replacedByHash: hashToken(tokens.refreshToken) },
      { where: { id: stored.id, revokedAt: null }, transaction },
    );
    if (revoked === 0) throw new UnauthorizedError('Refresh token has been revoked');

    return tokens;
  });
};

// Far more than one device rotates between two requests; only a guard against a malformed loop.
const MAX_CHAIN = 50;

/**
 * Revokes a refresh token and every token it was rotated into. A logout can race a refresh: the
 * browser sends the cookie it had while a refresh has already replaced it, and the replacement cookie
 * arrives after the logout. Following `replaced_by_hash` ends that device's session either way.
 */
const revokeChain = async (token) => {
  const now = new Date();
  let current = token;
  for (let i = 0; current && i < MAX_CHAIN; i += 1) {
    if (!current.revokedAt) await current.update({ revokedAt: now });
    if (!current.replacedByHash) break;
    current = await RefreshToken.findOne({ where: { tokenHash: current.replacedByHash, userId: token.userId } });
  }
};

/**
 * Revokes the refresh token from the cookie. The user comes from the (optional) Bearer token,
 * or else from the refresh token itself, so every logout is audited.
 */
export const logout = async (rawToken, userId, req, accessAuth) => {
  let ownerId = userId;
  // A valid Bearer token is cut off immediately rather than living out its remaining minutes.
  if (accessAuth?.jti && userId) await sessionService.revokeAccessToken({ ...accessAuth, userId });
  if (rawToken) {
    const stored = await RefreshToken.findOne({ where: { tokenHash: hashToken(rawToken) } });
    if (stored) {
      ownerId ??= stored.userId;
      await revokeChain(stored);
    }
  }
  if (ownerId) await audit.log({ userId: ownerId, action: 'auth.logout', entityType: 'User', entityId: ownerId, req });
};

/** Logs the user out on every device: all refresh tokens and all access tokens stop working now. */
export const logoutAll = async (userId, req) => {
  await sequelize.transaction(async (transaction) => {
    await sessionService.endAllSessions(userId, transaction);
    await audit.log({ userId, action: 'auth.logout_all', entityType: 'User', entityId: userId, req, transaction });
  });
};

const loadWithRole = (userId) => User.findByPk(userId, { include: roleAndStudent });

/**
 * Always resolves the same way whether or not the email exists, to avoid account enumeration.
 * ADMINs and not-yet-admitted students get a reset link straight away; REGISTRAR and LECTURER file a
 * request for an admin to approve. Admitted students have a PIN instead and recover it with
 * POST /auth/pin/forgot, so nothing happens for them here. Returns the raw token (direct resets only)
 * for internal use (tests).
 */
export const forgotPassword = async (email) => {
  const user = await User.findOne({ where: { email }, include: roleAndStudent });
  if (!user || user.status !== USER_STATUS.ACTIVE || hasPin(user)) return null;
  if (requiresApproval(user)) {
    await requestPasswordReset(user);
    return null;
  }
  return issuePasswordReset(user);
};

/**
 * The token is consumed atomically: a conditional UPDATE that only matches the unexpired, unused hash,
 * so two requests racing with the same link can't both succeed (the loser gets the same 400).
 */
export const resetPassword = async ({ token, password }) => {
  const hash = hashToken(token);
  const user = await User.scope('withSecrets').findOne({
    where: { passwordResetHash: hash, passwordResetExpires: { [Op.gt]: new Date() } },
    include: roleAndStudent,
  });
  if (!user) throw new BadRequestError('Reset token is invalid or has expired');
  if (hasPin(user)) throw new ForbiddenError('Students change their PIN instead (PATCH /auth/pin)');

  const passwordHash = await hashPassword(password);
  await sequelize.transaction(async (transaction) => {
    const [consumed] = await User.update(
      { passwordHash, passwordResetHash: null, passwordResetExpires: null },
      { where: { id: user.id, passwordResetHash: hash, passwordResetExpires: { [Op.gt]: new Date() } }, transaction },
    );
    if (consumed !== 1) throw new BadRequestError('Reset token is invalid or has expired');
    await sessionService.endAllSessions(user.id, transaction);
    await audit.log({ userId: user.id, action: 'auth.reset_password', entityType: 'User', entityId: user.id, transaction });
  });
  await user.reload({ attributes: ['id', 'email', 'firstName', 'tokenVersion'] });
  await sendCredentialAlert(user, 'passwordResetCompleted');
};

export const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.scope('withSecrets').findByPk(userId, { include: roleAndStudent });
  if (!user) throw new NotFoundError('User');
  if (hasPin(user)) throw new ForbiddenError('Students change their PIN instead (PATCH /auth/pin)');
  if (requiresApproval(user)) {
    throw new ForbiddenError("Password changes need an administrator's approval — request a password reset from your profile");
  }
  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    throw new BadRequestError('Current password is incorrect');
  }

  const passwordHash = await hashPassword(newPassword);
  await sequelize.transaction(async (transaction) => {
    await user.update({ passwordHash }, { transaction });
    await sessionService.endAllSessions(user.id, transaction);
    await audit.log({ userId, action: 'auth.change_password', entityType: 'User', entityId: userId, transaction });
  });
  await user.reload({ attributes: ['id', 'email', 'firstName', 'tokenVersion'] });
  await sendCredentialAlert(user, 'passwordChanged');
};

export const me = async (userId) => {
  const user = await loadProfile(userId);
  if (!user) throw new NotFoundError('User');
  return user;
};

/** Self-service profile edit. Email changes are deliberately not supported here (they'd need re-verification). */
export const updateProfile = async (userId, data, req) => {
  const user = await loadWithRole(userId);
  if (requiresApproval(user)) {
    throw new ForbiddenError("Name changes need an administrator's approval — send a name change request from your profile");
  }
  await User.update(data, { where: { id: userId } });
  await audit.log({ userId, action: 'auth.update_profile', entityType: 'User', entityId: userId, metadata: data, req });
  return me(userId);
};

// ── profile picture ──────────────────────────────────────────────────────────

const AVATAR_MAX_BYTES = 200 * 1024;
const THUMB_MAX_BYTES = 10 * 1024;
const AVATAR_PATTERN = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** The real format from the file's leading bytes, so a renamed or spoofed upload can't pass on its declared type. */
const sniffImage = (buf) => {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
};

/** Any role can set their own picture; it is not gated by the name-change approval flow. */
export const setAvatar = async (userId, { image, thumb }, req) => {
  const match = AVATAR_PATTERN.exec(image);
  if (!match) throw new BadRequestError('Upload a JPG, PNG or WebP image');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > AVATAR_MAX_BYTES) throw new BadRequestError('That picture is too large — choose one under 200 KB');
  if (sniffImage(bytes) !== match[1]) throw new BadRequestError('That file is not a valid image');

  // The thumbnail is optional (older clients don't send one); when present it gets the same scrutiny.
  let avatarThumb = null;
  if (thumb) {
    const thumbMatch = AVATAR_PATTERN.exec(thumb);
    const thumbBytes = thumbMatch && Buffer.from(thumbMatch[2], 'base64');
    if (!thumbMatch || thumbBytes.length > THUMB_MAX_BYTES || sniffImage(thumbBytes) !== 'jpeg') {
      throw new BadRequestError('The thumbnail is not a valid, small JPEG');
    }
    avatarThumb = thumb;
  }
  await User.update({ avatar: image, avatarThumb, avatarUpdatedAt: new Date() }, { where: { id: userId } });
  await audit.log({ userId, action: 'auth.set_avatar', entityType: 'User', entityId: userId, req });
  return me(userId);
};

/** Students (applicants included) must keep a picture, so they can replace it but not remove it. */
export const removeAvatar = async (userId, req) => {
  const user = await loadWithRole(userId);
  if (!user) throw new NotFoundError('User');
  if (user.role?.name === ROLES.STUDENT) throw new BadRequestError('A profile picture is required for students — upload a new one instead');
  await User.update({ avatar: null, avatarThumb: null, avatarUpdatedAt: null }, { where: { id: userId } });
  await audit.log({ userId, action: 'auth.remove_avatar', entityType: 'User', entityId: userId, req });
  return me(userId);
};

/** Consumed atomically (conditional UPDATE), so a link can't be used twice even by parallel requests. */
export const verifyEmail = async ({ token }) => {
  const hash = hashToken(token);
  const user = await User.findOne({
    where: { emailVerificationHash: hash, emailVerificationExpires: { [Op.gt]: new Date() } },
  });
  if (!user) throw new BadRequestError('Verification link is invalid or has expired');
  const [consumed] = await User.update(
    { emailVerifiedAt: new Date(), emailVerificationHash: null, emailVerificationExpires: null },
    { where: { id: user.id, emailVerificationHash: hash, emailVerificationExpires: { [Op.gt]: new Date() } } },
  );
  if (consumed !== 1) throw new BadRequestError('Verification link is invalid or has expired');
  await audit.log({ userId: user.id, action: 'auth.verify_email', entityType: 'User', entityId: user.id });
};

export const resendVerification = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throw new NotFoundError('User');
  if (user.emailVerifiedAt) throw new ConflictError('Your email address is already verified');
  await sendVerificationEmail(user, await issueVerificationToken(user.id));
  await audit.log({ userId, action: 'auth.resend_verification', entityType: 'User', entityId: userId });
};

// ── sessions (one per signed-in device: its active refresh token) ────────────

export const listSessions = async (userId, rawToken) => {
  const currentHash = rawToken ? hashToken(rawToken) : null;
  const rows = await RefreshToken.findAll({
    where: { userId, revokedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [['createdAt', 'DESC']],
  });
  return rows.map((t) => ({
    id: t.id,
    userAgent: t.userAgent,
    ipAddress: t.ipAddress,
    // Refresh tokens rotate, so the current row's creation time is the device's last activity.
    lastActiveAt: t.createdAt,
    expiresAt: t.expiresAt,
    current: t.tokenHash === currentHash,
  }));
};

/** Signs one other device out: its refresh token stops working and its current access token is revoked now. */
/** `actor` is set when an admin signs a user's device out for them. */
export const endSession = async (userId, sessionId, rawToken, req, actor) => {
  const session = await RefreshToken.findOne({ where: { id: sessionId, userId, revokedAt: null } });
  if (!session) throw new NotFoundError('Session');
  if (rawToken && session.tokenHash === hashToken(rawToken)) {
    throw new BadRequestError('This is the device you are using — sign out instead');
  }
  await sequelize.transaction(async (transaction) => {
    await session.update({ revokedAt: new Date() }, { transaction });
    if (session.accessJti && session.accessExpiresAt > new Date()) {
      await sessionService.revokeAccessToken(
        { jti: session.accessJti, exp: Math.floor(session.accessExpiresAt.getTime() / 1000), userId },
        transaction,
      );
    }
    await audit.log({
      userId: actor?.id ?? userId, action: 'auth.end_session', entityType: 'User', entityId: userId, metadata: { sessionId }, req, transaction,
    });
  });
};
