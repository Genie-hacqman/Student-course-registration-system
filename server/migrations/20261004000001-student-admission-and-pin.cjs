'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'must_change_password', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('users', 'failed_login_attempts', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('users', 'locked_until', { type: Sequelize.DATE });
    await queryInterface.addColumn('users', 'pin_otp_hash', { type: Sequelize.CHAR(64) });
    await queryInterface.addColumn('users', 'pin_otp_expires', { type: Sequelize.DATE });
    await queryInterface.addColumn('users', 'pin_otp_attempts', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('users', 'pin_otp_sent_at', { type: Sequelize.DATE });

    await queryInterface.addColumn('students', 'admission_session', { type: Sequelize.STRING(9) });
    await queryInterface.addColumn('students', 'admission_number', { type: Sequelize.STRING(30), unique: true });

    await queryInterface.addColumn('programs', 'qualification_code', { type: Sequelize.STRING(20) });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('programs', 'qualification_code');
    await queryInterface.removeColumn('students', 'admission_number');
    await queryInterface.removeColumn('students', 'admission_session');
    for (const column of ['pin_otp_sent_at', 'pin_otp_attempts', 'pin_otp_expires', 'pin_otp_hash', 'locked_until', 'failed_login_attempts', 'must_change_password']) {
      await queryInterface.removeColumn('users', column);
    }
  },
};
