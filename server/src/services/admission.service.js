import { randomBytes } from 'node:crypto';
import { sequelize, User, Role, Student, Program } from '../models/index.js';
import env from '../config/env.js';
import { BadRequestError, ConflictError } from '../utils/errors.js';
import { ROLES, USER_STATUS } from '../utils/constants.js';
import { hashTemporaryPin } from '../utils/password.js';
import { generatePin, schoolEmailFor, sessionStartYear } from '../utils/pin.js';
import { createStudentRecord, getById as getStudent } from './student.service.js';
import { runImport } from './import.service.js';
import * as settingService from './setting.service.js';
import * as audit from './audit.service.js';

/*
 * Staff admission (direct and bulk). Online applications (application.service) are the other way in and
 * share `assignStudentIdentity`. Here the school creates the account
 * with a generated Student ID (STU + session year + id, e.g. STU202600123), a school email derived
 * from it, and a random temporary PIN that the student must change at first sign-in.
 *
 * The PIN is returned exactly once, in the response, for the admission letter. It is never stored
 * in clear, emailed, or written to the audit log.
 */

/** The institution's student email domain; admission refuses to run without it. */
export const studentEmailDomain = async (transaction) => {
  // The setting (Staff → System settings) wins; SCHOOL_EMAIL_DOMAIN in the environment is the fallback.
  const domain = await settingService.get('institution.studentEmailDomain', { transaction }) || env.SCHOOL_EMAIL_DOMAIN;
  if (!domain) {
    throw new BadRequestError('Set the student email domain first (setting institution.studentEmailDomain, e.g. school.edu.gh, or SCHOOL_EMAIL_DOMAIN)');
  }
  return domain;
};

export const studentRoleId = async (ctx, transaction) => {
  if (!ctx.roleId) {
    const role = await Role.findOne({ where: { name: ROLES.STUDENT }, transaction });
    if (!role) throw new Error('STUDENT role missing — run the seeders');
    ctx.roleId = role.id;
  }
  return ctx.roleId;
};

import { assertProgramOpen } from './org-status.service.js';
export const findProgram = async ({ programId, programCode }, transaction) => {
  const program = programId
    ? await Program.findByPk(programId, { transaction })
    : await Program.findOne({ where: { code: programCode }, transaction });
  if (!program) throw new BadRequestError(`Unknown programme ${programCode ?? programId}`);
  await assertProgramOpen(program.id, { transaction, what: 'new admissions' });
  return program;
};

/**
 * Makes an existing user a student: inserts the student row (generated Student ID unless one is given)
 * and gives the user their school email, all in the caller's transaction. Shared by staff admission and
 * online applications (application.service), so both assign identifiers exactly the same way.
 */
export const assignStudentIdentity = async (user, row, program, ctx, transaction) => {
  const student = await createStudentRecord({
    userId: user.id,
    programId: program.id,
    studentNumber: row.studentNumber,
    level: row.level ?? 100,
    admissionYear: sessionStartYear(row.admissionSession),
    admissionSession: row.admissionSession,
    admissionNumber: row.admissionNumber,
  }, transaction);

  const email = schoolEmailFor(student.studentNumber, ctx.domain);
  if (await User.findOne({ where: { email }, attributes: ['id'], transaction })) {
    throw new ConflictError(`${email} already belongs to another account`);
  }
  return { student, email };
};

/**
 * Creates the user + student in the caller's transaction and returns the one-time credentials.
 * The school email depends on the Student ID, which depends on the new row's id, so the user is
 * created with a throwaway placeholder address and given the real one in the same transaction.
 */
const createAdmission = async (row, program, ctx, transaction, { via = 'single' } = {}) => {
  if (row.admissionNumber && await Student.findOne({ where: { admissionNumber: row.admissionNumber }, transaction })) {
    throw new ConflictError(`Admission number ${row.admissionNumber} has already been admitted`);
  }

  const user = await User.create({
    roleId: await studentRoleId(ctx, transaction),
    firstName: row.firstName,
    lastName: row.lastName,
    email: `pending-${randomBytes(8).toString('hex')}@admission.invalid`,
    passwordHash: '!', // replaced below, before commit
    status: USER_STATUS.ACTIVE,
    mustChangePassword: true,
    // The school owns the mailbox, so there is nothing for the student to verify.
    emailVerifiedAt: new Date(),
  }, { transaction });

  const { student, email } = await assignStudentIdentity(user, row, program, ctx, transaction);
  const pin = generatePin({ studentNumber: student.studentNumber });
  await user.update({ email, passwordHash: await hashTemporaryPin(pin) }, { transaction });

  // Inside the row's transaction, so the admission and its record stand or fall together (and a dry run rolls
  // both back). Never the PIN: only who was admitted and how.
  await audit.log({
    userId: ctx.actor?.id, action: 'student.admit', entityType: 'Student', entityId: student.id, transaction,
    metadata: { studentNumber: student.studentNumber, admissionNumber: row.admissionNumber ?? null, via },
  });

  return { student, credentials: { studentNumber: student.studentNumber, schoolEmail: email, pin } };
};

/** Admits one student. Returns the student profile and the one-time credentials. */
export const admit = async (data, actor) => {
  const { student, credentials } = await sequelize.transaction(async (transaction) => {
    const ctx = { domain: await studentEmailDomain(transaction), actor };
    const program = await findProgram(data, transaction);
    return createAdmission(data, program, ctx, transaction);
  });
  return { student: await getStudent(student.id), credentials };
};

/**
 * Bulk admission, with the same per-row transactions and dry run as the other imports.
 * A row whose studentNumber or admissionNumber is already known updates that student (name,
 * programme, level, session) and never issues a new PIN; only new admissions get credentials.
 */
export const admitMany = async (body, actor) => {
  const domain = await studentEmailDomain();
  return runImport(body, async (row, transaction, ctx) => {
    ctx.domain = domain;
    const program = await findProgram(row, transaction);

    const where = row.studentNumber ? { studentNumber: row.studentNumber } : { admissionNumber: row.admissionNumber };
    const existing = await Student.findOne({ where, include: [{ model: User, as: 'user' }], transaction });
    if (!existing) {
      const { credentials } = await createAdmission(row, program, ctx, transaction, { via: 'bulk' });
      return { outcome: 'created', credentials };
    }

    existing.user.set({ firstName: row.firstName, lastName: row.lastName });
    existing.set(Object.fromEntries(Object.entries({
      programId: program.id,
      level: row.level,
      admissionSession: row.admissionSession,
      admissionYear: sessionStartYear(row.admissionSession),
      admissionNumber: row.admissionNumber,
    }).filter(([, v]) => v !== undefined)));
    const changed = existing.changed() || existing.user.changed();
    await existing.user.save({ transaction });
    await existing.save({ transaction });
    return { outcome: changed ? 'updated' : 'unchanged' };
  }, {
    actor, action: 'import.admissions', withCredentials: true, keyOf: (r) => r.studentNumber ?? r.admissionNumber,
  });
};
