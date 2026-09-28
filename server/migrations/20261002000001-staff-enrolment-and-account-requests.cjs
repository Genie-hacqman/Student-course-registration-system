'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    // Password resets and name changes that wait for the super admin's approval.
    await queryInterface.createTable('account_change_requests', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      type: { type: Sequelize.ENUM('password_reset', 'name_change'), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      first_name: { type: Sequelize.STRING(100) },
      last_name: { type: Sequelize.STRING(100) },
      note: { type: Sequelize.STRING(500) },
      reviewed_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      reviewed_at: { type: Sequelize.DATE },
      review_note: { type: Sequelize.STRING(500) },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('account_change_requests', ['status', 'created_at']);
    await queryInterface.addIndex('account_change_requests', ['user_id', 'type', 'status']);

    // Staff enrolment: who added the course, and which registration checks they overrode (and why).
    await queryInterface.addColumn('registration_items', 'added_by', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      after: 'status',
    });
    await queryInterface.addColumn('registration_items', 'overridden_rules', { type: Sequelize.JSON, after: 'added_by' });
    await queryInterface.addColumn('registration_items', 'override_reason', { type: Sequelize.STRING(500), after: 'overridden_rules' });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('registration_items', 'override_reason');
    await queryInterface.removeColumn('registration_items', 'overridden_rules');
    await queryInterface.removeColumn('registration_items', 'added_by');
    await queryInterface.dropTable('account_change_requests');
  },
};
