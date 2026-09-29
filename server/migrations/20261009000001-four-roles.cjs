'use strict';

/**
 * Four roles: ADMIN, REGISTRAR, LECTURER, STUDENT.
 *
 *   USER             → renamed STUDENT (same row, so every student keeps their role)
 *   SUPER_ADMIN      → users move to ADMIN
 *   ACADEMIC_ADVISOR → users move to REGISTRAR
 *   APPLICANT        → users move to STUDENT; their admission_applications rows are untouched, and
 *                      their admission state is derived from them (see auth.service.admissionStatusOf)
 *
 * Moved users get token_version + 1, which ends their sessions (their permissions changed). Permission
 * overrides of the removed roles, and of ADMIN (now fixed), are deleted: they were differences from
 * defaults that no longer exist. Nothing else is deleted. Safe on a fresh database (where the roles
 * seeder hasn't run yet) and re-runnable.
 *
 * down() renames STUDENT back to USER and recreates the removed role rows, but cannot know which users
 * used to hold them: those users stay ADMIN / REGISTRAR / STUDENT.
 */
const FOUR = [
  ['ADMIN', 'Institution administration: accounts, admission, departments, programmes, settings'],
  ['REGISTRAR', 'Academic administration: courses, offerings, lecturer assignment, registrations, timetable'],
  ['LECTURER', 'Teaching staff'],
  ['STUDENT', 'Students, including applicants who are not admitted yet'],
];
const MOVES = [['SUPER_ADMIN', 'ADMIN'], ['ACADEMIC_ADVISOR', 'REGISTRAR'], ['APPLICANT', 'STUDENT']];

module.exports = {
  async up(queryInterface, Sequelize) {
    const q = queryInterface.sequelize;
    const report = await q.transaction(async (transaction) => {
      const run = (sql, replacements = {}, type) => q.query(sql, { replacements, transaction, ...(type ? { type } : {}) });
      const idOf = async (name) => (await run('SELECT id FROM roles WHERE name = :name', { name }))[0][0]?.id ?? null;
      const moveUsers = async (fromId, toId) => {
        const [, affected] = await run(
          'UPDATE users SET role_id = :toId, token_version = token_version + 1 WHERE role_id = :fromId',
          { fromId, toId },
          Sequelize.QueryTypes.UPDATE,
        );
        return affected ?? 0;
      };
      const moved = {};

      await run(`DELETE o FROM role_permission_overrides o JOIN roles r ON r.id = o.role_id
                  WHERE r.name IN ('SUPER_ADMIN', 'ACADEMIC_ADVISOR', 'APPLICANT', 'ADMIN')`);

      // USER → STUDENT: rename in place (users keep their role id); merge if both somehow exist.
      const userRole = await idOf('USER');
      if (userRole) {
        const studentRole = await idOf('STUDENT');
        if (studentRole) {
          moved.USER = await moveUsers(userRole, studentRole);
          await run('DELETE FROM role_permission_overrides WHERE role_id = :userRole', { userRole });
          await run('DELETE FROM roles WHERE id = :userRole', { userRole });
        } else {
          const [[{ n }]] = await run('SELECT COUNT(*) AS n FROM users WHERE role_id = :userRole', { userRole });
          moved.USER = Number(n);
          await run("UPDATE roles SET name = 'STUDENT', updated_at = NOW() WHERE id = :userRole", { userRole });
        }
      }

      for (const [name, description] of FOUR) {
        await run(
          `INSERT INTO roles (name, description, created_at, updated_at) VALUES (:name, :description, NOW(), NOW())
           ON DUPLICATE KEY UPDATE description = :description`,
          { name, description },
        );
      }

      for (const [from, to] of MOVES) {
        const fromId = await idOf(from);
        if (!fromId) continue;
        moved[from] = await moveUsers(fromId, await idOf(to));
        await run('DELETE FROM roles WHERE id = :fromId', { fromId });
      }
      return moved;
    });

    // Migration output, so whoever runs it sees what changed.
    // eslint-disable-next-line no-console
    console.log('four-roles migration — users moved:', JSON.stringify(report));
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    await q.transaction(async (transaction) => {
      await q.query("UPDATE roles SET name = 'USER', updated_at = NOW() WHERE name = 'STUDENT'", { transaction });
      for (const [name, description] of [
        ['SUPER_ADMIN', 'Full access, including roles and settings'],
        ['ACADEMIC_ADVISOR', 'Approves student registrations'],
        ['APPLICANT', 'Prospective student with an online application'],
      ]) {
        await q.query(
          'INSERT IGNORE INTO roles (name, description, created_at, updated_at) VALUES (:name, :description, NOW(), NOW())',
          { replacements: { name, description }, transaction },
        );
      }
    });
  },
};
