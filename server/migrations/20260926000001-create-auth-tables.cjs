'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roles', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(255) },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('users', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      role_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'roles', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      first_name: { type: Sequelize.STRING(100), allowNull: false },
      last_name: { type: Sequelize.STRING(100), allowNull: false },
      email: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: false },
      status: { type: Sequelize.ENUM('active', 'suspended', 'pending'), allowNull: false, defaultValue: 'active' },
      password_reset_hash: { type: Sequelize.STRING(64) },
      password_reset_expires: { type: Sequelize.DATE },
      last_login_at: { type: Sequelize.DATE },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('users', ['role_id']);
    await queryInterface.addIndex('users', ['password_reset_hash']);

    await queryInterface.createTable('refresh_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      token_hash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      revoked_at: { type: Sequelize.DATE },
      replaced_by_hash: { type: Sequelize.STRING(64) },
      user_agent: { type: Sequelize.STRING(255) },
      ip_address: { type: Sequelize.STRING(64) },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('refresh_tokens', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('refresh_tokens');
    await queryInterface.dropTable('users');
    await queryInterface.dropTable('roles');
  },
};
