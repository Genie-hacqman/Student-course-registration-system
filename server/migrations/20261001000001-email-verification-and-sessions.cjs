'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email_verified_at', { type: Sequelize.DATE, after: 'status' });
    await queryInterface.addColumn('users', 'email_verification_hash', { type: Sequelize.STRING(64), after: 'email_verified_at' });
    await queryInterface.addColumn('users', 'email_verification_expires', { type: Sequelize.DATE, after: 'email_verification_hash' });
    await queryInterface.addIndex('users', ['email_verification_hash']);
    // Accounts that exist before verification was introduced were created by staff or seeders, so they count as verified.
    await queryInterface.sequelize.query('UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL');

    // The access token issued alongside each refresh token, so ending one session can cut off its access token too.
    await queryInterface.addColumn('refresh_tokens', 'access_jti', { type: Sequelize.CHAR(36), after: 'replaced_by_hash' });
    await queryInterface.addColumn('refresh_tokens', 'access_expires_at', { type: Sequelize.DATE, after: 'access_jti' });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('refresh_tokens', 'access_expires_at');
    await queryInterface.removeColumn('refresh_tokens', 'access_jti');
    await queryInterface.removeIndex('users', ['email_verification_hash']);
    await queryInterface.removeColumn('users', 'email_verification_expires');
    await queryInterface.removeColumn('users', 'email_verification_hash');
    await queryInterface.removeColumn('users', 'email_verified_at');
  },
};
