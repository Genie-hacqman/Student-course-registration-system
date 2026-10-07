import { createRequire } from 'node:module';
import { sequelize, User, Role } from '../src/models/index.js';
import { hashPassword } from '../src/utils/password.js';
import { ROLES, USER_STATUS } from '../src/utils/constants.js';
import * as audit from '../src/services/audit.service.js';

const require = createRequire(import.meta.url);
const { resolveAdminCredentials } = require('../seeders/20260926000001-roles-and-admin.cjs');

export const createAdmin = async () => {
  const { email, password } = resolveAdminCredentials();

  return sequelize.transaction(async (transaction) => {
    const role = await Role.findOne({ where: { name: ROLES.ADMIN }, transaction });
    if (!role) throw new Error('The ADMIN role is missing. Run `npm run db:seed` first.');

    const existing = await User.findOne({ where: { roleId: role.id }, attributes: ['email'], transaction });
    if (existing) return { created: false, email: existing.email };

    const taken = await User.findOne({ where: { email }, include: [{ model: Role, as: 'role', attributes: ['name'] }], transaction });
    if (taken) throw new Error(`${email} already belongs to a ${taken.role.name} account; set a different SEED_ADMIN_EMAIL.`);

    const user = await User.create({
      roleId: role.id,
      firstName: 'System',
      lastName: 'Administrator',
      email,
      passwordHash: await hashPassword(password),
      status: USER_STATUS.ACTIVE,
      emailVerifiedAt: new Date(),
    }, { transaction });
    await audit.log({
      userId: user.id, action: 'user.create', entityType: 'User', entityId: user.id, metadata: { role: ROLES.ADMIN, via: 'admin:create' }, actor: { email: 'system:script:create-admin', role: 'SYSTEM' }, transaction,
    });
    return { created: true, email };
  });
};

if (import.meta.main) {
  try {
    const { created, email } = await createAdmin();
    console.log(created
      ? `Created admin ${email}. Sign in on the Staff tab with the SEED_ADMIN_PASSWORD from your environment.`
      : `An admin already exists (${email}); nothing changed.`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}
