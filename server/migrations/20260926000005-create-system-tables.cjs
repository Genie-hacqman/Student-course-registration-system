'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(50), allowNull: false },
      title: { type: Sequelize.STRING(200), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      data: { type: Sequelize.JSON },
      read_at: { type: Sequelize.DATE },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('notifications', ['user_id', 'read_at']);

    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      action: { type: Sequelize.STRING(100), allowNull: false },
      entity_type: { type: Sequelize.STRING(50) },
      entity_id: { type: Sequelize.INTEGER },
      metadata: { type: Sequelize.JSON },
      ip_address: { type: Sequelize.STRING(64) },
      request_id: { type: Sequelize.STRING(64) },
      created_at: now,
    });
    await queryInterface.addIndex('audit_logs', ['user_id']);
    await queryInterface.addIndex('audit_logs', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('audit_logs', ['action']);

    await queryInterface.createTable('settings', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      key: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      value: { type: Sequelize.JSON },
      description: { type: Sequelize.STRING(255) },
      created_at: now,
      updated_at: now,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('settings');
    await queryInterface.dropTable('audit_logs');
    await queryInterface.dropTable('notifications');
  },
};
