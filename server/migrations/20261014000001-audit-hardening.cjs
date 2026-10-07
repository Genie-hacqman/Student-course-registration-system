'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('audit_logs', 'user_agent', { type: Sequelize.STRING(255) });
    await queryInterface.addColumn('audit_logs', 'actor_email', { type: Sequelize.STRING(255) });
    await queryInterface.addColumn('audit_logs', 'actor_role', { type: Sequelize.STRING(30) });
    await queryInterface.addColumn('audit_logs', 'row_hmac', { type: Sequelize.CHAR(64) });

    await queryInterface.addIndex('audit_logs', ['created_at'], { name: 'audit_logs_created_at' });
    await queryInterface.addIndex('audit_logs', ['action', 'created_at'], { name: 'audit_logs_action_created_at' });

    await queryInterface.createTable('audit_seals', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      stream: { type: Sequelize.STRING(10), allowNull: false },
      from_id: { type: Sequelize.INTEGER, allowNull: false },
      to_id: { type: Sequelize.INTEGER, allowNull: false },
      row_count: { type: Sequelize.INTEGER, allowNull: false },
      last_row_at: { type: Sequelize.DATE, allowNull: false },
      prev_seal_hash: { type: Sequelize.CHAR(64), allowNull: false },
      seal_hash: { type: Sequelize.CHAR(64), allowNull: false },
      archive_key: { type: Sequelize.STRING(255) },
      purged_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('audit_seals', ['stream', 'from_id'], { unique: true, name: 'audit_seals_stream_from' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('audit_seals');
    await queryInterface.removeIndex('audit_logs', 'audit_logs_action_created_at');
    await queryInterface.removeIndex('audit_logs', 'audit_logs_created_at');
    await queryInterface.removeColumn('audit_logs', 'row_hmac');
    await queryInterface.removeColumn('audit_logs', 'actor_role');
    await queryInterface.removeColumn('audit_logs', 'actor_email');
    await queryInterface.removeColumn('audit_logs', 'user_agent');
  },
};
