'use strict';

/**
 * Online admission: applicants sign up with their personal email, submit one application, and an
 * admin admits or rejects it. Admission turns the same user row into a student account, which the
 * student activates through a single-use, time-limited link (only its sha256 hash is stored).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    // The roles seeder only runs on fresh databases, so existing ones get the new role here.
    await queryInterface.sequelize.query(
      `INSERT IGNORE INTO roles (name, description, created_at, updated_at)
       VALUES ('APPLICANT', 'Prospective student with an online application', NOW(), NOW())`,
    );

    await queryInterface.addColumn('users', 'activation_hash', { type: Sequelize.CHAR(64) });
    await queryInterface.addColumn('users', 'activation_expires', { type: Sequelize.DATE });
    await queryInterface.addIndex('users', ['activation_hash'], { unique: true, name: 'users_activation_hash' });

    await queryInterface.createTable('admission_applications', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      // One application per account.
      user_id: {
        type: Sequelize.INTEGER, allowNull: false, unique: true,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      personal_email: { type: Sequelize.STRING(191), allowNull: false },
      first_name: { type: Sequelize.STRING(100), allowNull: false },
      last_name: { type: Sequelize.STRING(100), allowNull: false },
      other_names: { type: Sequelize.STRING(100) },
      date_of_birth: { type: Sequelize.DATEONLY },
      phone: { type: Sequelize.STRING(30) },
      department_id: {
        type: Sequelize.INTEGER,
        references: { model: 'departments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      program_id: {
        type: Sequelize.INTEGER,
        references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      entry_level: { type: Sequelize.INTEGER },
      admission_session: { type: Sequelize.STRING(9) },
      status: { type: Sequelize.ENUM('draft', 'submitted', 'admitted', 'rejected'), allowNull: false, defaultValue: 'draft' },
      submitted_at: { type: Sequelize.DATE },
      reviewed_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      reviewed_at: { type: Sequelize.DATE },
      rejection_reason: { type: Sequelize.STRING(500) },
      // Set on admission; unique so an application can never produce two student records.
      student_id: {
        type: Sequelize.INTEGER, unique: true,
        references: { model: 'students', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('admission_applications', ['status', 'submitted_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admission_applications');
    await queryInterface.removeIndex('users', 'users_activation_hash');
    await queryInterface.removeColumn('users', 'activation_expires');
    await queryInterface.removeColumn('users', 'activation_hash');
    await queryInterface.sequelize.query(
      "DELETE FROM roles WHERE name = 'APPLICANT' AND NOT EXISTS (SELECT 1 FROM users WHERE users.role_id = roles.id)",
    );
  },
};
