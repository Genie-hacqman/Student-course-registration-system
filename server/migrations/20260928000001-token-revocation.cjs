'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Access tokens revoked before they expire (logout). Rows can be purged once expires_at has passed.
    await queryInterface.createTable('revoked_access_tokens', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      jti: { type: Sequelize.CHAR(36), allowNull: false, unique: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('revoked_access_tokens', ['expires_at']);
    await queryInterface.addIndex('refresh_tokens', ['expires_at']);

    // Bumping this invalidates every access token the user holds ("log out everywhere").
    await queryInterface.addColumn('users', 'token_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
      after: 'status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'token_version');
    await queryInterface.removeIndex('refresh_tokens', ['expires_at']);
    await queryInterface.dropTable('revoked_access_tokens');
  },
};
