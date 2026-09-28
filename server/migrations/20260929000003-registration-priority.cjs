'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    // Staggered opening: e.g. level >= 400 from Monday, >= 300 from Tuesday, everyone else from Wednesday.
    await queryInterface.createTable('registration_priority_windows', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      semester_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'semesters', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(100), allowNull: false },
      min_level: { type: Sequelize.INTEGER },
      program_id: {
        type: Sequelize.INTEGER,
        references: { model: 'programs', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      opens_at: { type: Sequelize.DATE, allowNull: false },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('registration_priority_windows', ['semester_id', 'opens_at']);

    // Individual early access (athletes, accessibility accommodations, ...).
    await queryInterface.createTable('registration_time_overrides', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'students', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      semester_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'semesters', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      opens_at: { type: Sequelize.DATE, allowNull: false },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      granted_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addConstraint('registration_time_overrides', {
      fields: ['student_id', 'semester_id'],
      type: 'unique',
      name: 'registration_time_overrides_student_semester_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('registration_time_overrides');
    await queryInterface.dropTable('registration_priority_windows');
  },
};
