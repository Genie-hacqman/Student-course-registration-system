import os from 'node:os';
import { createHash } from 'node:crypto';

const ACADEMIC_TABLES = {
  registrations: 'registrations',
  results: 'results',
  attendance_records: 'attendance records',
  assessment_scores: 'assessment scores',
  waitlists: 'waitlist entries',
  prerequisite_overrides: 'prerequisite waivers',
  registration_time_overrides: 'registration-time overrides',
};

export class RefusedError extends Error {}

const count = async (sequelize, table, column, id, transaction) => {
  const [[row]] = await sequelize.query(`SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` = :id`, { replacements: { id }, transaction });
  return Number(row.n);
};

export const deleteApplicant = async ({ email, apply = false, includeAdmitted = false } = {}) => {
  const { sequelize, User, Role, Student, AdmissionApplication } = await import('../src/models/index.js');
  const { default: env } = await import('../src/config/env.js');
  const { ROLES } = await import('../src/utils/constants.js');
  const audit = await import('../src/services/audit.service.js');
  const storage = await import('../src/services/storage.service.js');

  const address = String(email ?? '').trim().toLowerCase();
  if (!address) throw new RefusedError('Give the account\'s email: --email someone@example.com');

  const inspect = async (transaction) => {
    const [matches] = await sequelize.query(
      `SELECT id FROM users WHERE email = :address
       UNION SELECT user_id AS id FROM admission_applications WHERE personal_email = :address`,
      { replacements: { address }, transaction },
    );
    if (matches.length === 0) throw new RefusedError(`No account or application found for ${address}.`);
    if (matches.length > 1) throw new RefusedError(`${address} matches more than one account; nothing was changed.`);

    const user = await User.scope('withAvatar').findByPk(matches[0].id, {
      include: [
        { model: Role, as: 'role', attributes: ['name'] },
        { model: Student, as: 'student', attributes: ['id', 'studentNumber'] },
        { model: AdmissionApplication, as: 'application' },
      ],
      transaction,
      ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
    });
    const role = user.role?.name;
    if (role !== ROLES.STUDENT) {
      throw new RefusedError(`${address} is a ${role} account. This tool only removes applicants; staff accounts are never touched.`);
    }

    const { student, application } = user;
    const academic = {};
    if (student) {
      if (!application || application.studentId !== student.id) {
        throw new RefusedError(`${address} is a student admitted by staff (${student.studentNumber}), not an online applicant. Not deleted.`);
      }
      for (const [table, label] of Object.entries(ACADEMIC_TABLES)) {
        const n = await count(sequelize, table, 'student_id', student.id, transaction);
        if (n) academic[label] = n;
      }
      if (Object.keys(academic).length) {
        const list = Object.entries(academic).map(([label, n]) => `${n} ${label}`).join(', ');
        throw new RefusedError(`${address} (${student.studentNumber}) has academic records (${list}). Deleting would destroy them, so it was not deleted.`);
      }
      if (!includeAdmitted) {
        throw new RefusedError(`${address} has been admitted (${student.studentNumber}). If this is a test account, run again with --include-admitted.`);
      }
    }

    return {
      database: `${env.DB_HOST}:${env.DB_PORT}/${env.dbName}`,
      user: { id: user.id, name: `${user.firstName} ${user.lastName}`, email: user.email, status: user.status },
      application: application && {
        id: application.id,
        number: `APP${String(application.id).padStart(6, '0')}`,
        status: application.status,
        personalEmail: application.personalEmail,
        photoKey: application.photoKey ?? null,
      },
      studentNumber: student?.studentNumber ?? null,
      removes: {
        notifications: await count(sequelize, 'notifications', 'user_id', user.id, transaction),
        sessions: await count(sequelize, 'refresh_tokens', 'user_id', user.id, transaction),
        changeRequests: await count(sequelize, 'account_change_requests', 'user_id', user.id, transaction),
        profilePicture: Boolean(user.avatar),
      },
      keeps: {
        auditEntries: await count(sequelize, 'audit_logs', 'user_id', user.id, transaction),
        emailLogEntries: await count(sequelize, 'email_deliveries', 'user_id', user.id, transaction),
      },
    };
  };

  const plan = await inspect();
  if (!apply) return { ...plan, deleted: false };

  const final = await sequelize.transaction(async (transaction) => {
    const checked = await inspect(transaction);
    await User.destroy({ where: { id: checked.user.id }, transaction });
    await audit.log({
      actor: { email: `system:script:delete-applicant (${os.userInfo().username})`, role: 'SYSTEM' },
      action: 'applicant.delete',
      entityType: 'User',
      entityId: checked.user.id,
      metadata: {
        applicationNumber: checked.application?.number ?? null,
        studentNumber: checked.studentNumber,
        status: checked.user.status,
        emailFingerprint: createHash('sha256').update(checked.user.email.toLowerCase()).digest('hex').slice(0, 16),
        via: 'applicant:delete',
      },
      transaction,
    });
    return checked;
  });

  let photo = 'none';
  const key = final.application?.photoKey;
  if (key) {
    if (!storage.isConfigured()) {
      photo = `not removed (storage not configured here). Delete this object by hand in your bucket: ${key}`;
    } else {
      try {
        await storage.remove(key);
        photo = 'removed';
      } catch (err) {
        photo = `could not be removed (${err.message}). Delete this object by hand in your bucket: ${key}`;
      }
    }
  }
  return { ...final, deleted: true, photo };
};

const describe = (r) => [
  `Database:     ${r.database}`,
  `Account:      ${r.user.name} <${r.user.email}> (user #${r.user.id}, ${r.user.status})`,
  r.application
    ? `Application:  ${r.application.number}, ${r.application.status}, personal email ${r.application.personalEmail}, ${r.application.photoKey ? 'has an official photo' : 'no photo'}`
    : 'Application:  none',
  `Student:      ${r.studentNumber ?? 'not admitted'}`,
  `Removes:      the account and its application${r.studentNumber ? ' and student record' : ''}${r.application?.photoKey ? ', the official photo' : ''}${r.removes.profilePicture ? ', the profile picture' : ''}, ${r.removes.notifications} notification(s), ${r.removes.sessions} session(s), ${r.removes.changeRequests} change request(s)`,
  `Keeps:        ${r.keeps.auditEntries} audit entr(ies) and ${r.keeps.emailLogEntries} email log entr(ies), with the user link cleared`,
].join('\n');

if (import.meta.main) {
  process.env.LOG_LEVEL ??= 'warn';
  const args = process.argv.slice(2);
  const valueOf = (flag) => {
    const inline = args.find((a) => a.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1);
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (args.includes('--help') || !valueOf('--email')) {
    console.log('Usage: npm run applicant:delete -- --email <address> [--yes] [--include-admitted]\n'
      + 'Without --yes it only shows what would be removed.');
    process.exit(args.includes('--help') ? 0 : 1);
  }

  let sequelize;
  try {
    ({ sequelize } = await import('../src/models/index.js'));
    const apply = args.includes('--yes');
    const result = await deleteApplicant({ email: valueOf('--email'), apply, includeAdmitted: args.includes('--include-admitted') });
    console.log(describe(result));
    if (result.deleted) {
      console.log(`\nDeleted. Official photo: ${result.photo}. An audit entry (applicant.delete) records what was removed.`);
    } else {
      console.log('\nDry run: nothing was changed. Run the same command with --yes to delete.');
    }
  } catch (err) {
    console.error(err instanceof RefusedError ? `Refused: ${err.message}` : `Failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await sequelize?.close();
  }
}
