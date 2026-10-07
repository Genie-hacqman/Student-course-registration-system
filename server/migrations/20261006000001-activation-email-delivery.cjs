'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const [duplicates] = await queryInterface.sequelize.query(
      'SELECT personal_email FROM admission_applications GROUP BY personal_email HAVING COUNT(*) > 1',
    );
    if (duplicates.length) {
      throw new Error(`Several applications share a personal email (${duplicates.map((d) => d.personal_email).join(', ')}); resolve them before migrating. Nothing was changed.`);
    }

    await queryInterface.addColumn('admission_applications', 'activation_email_sent_at', { type: Sequelize.DATE, after: 'student_id' });
    await queryInterface.addColumn('admission_applications', 'activation_email_last_attempt_at', { type: Sequelize.DATE, after: 'activation_email_sent_at' });
    await queryInterface.addColumn('admission_applications', 'activation_email_attempts', {
      type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, after: 'activation_email_last_attempt_at',
    });
    await queryInterface.addColumn('admission_applications', 'activation_email_error', { type: Sequelize.STRING(255), after: 'activation_email_attempts' });
    await queryInterface.addColumn('admission_applications', 'account_activated_at', { type: Sequelize.DATE, after: 'activation_email_error' });
    await queryInterface.addIndex('admission_applications', ['personal_email'], { unique: true, name: 'admission_applications_personal_email' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('admission_applications', 'admission_applications_personal_email');
    for (const column of ['account_activated_at', 'activation_email_error', 'activation_email_attempts', 'activation_email_last_attempt_at', 'activation_email_sent_at']) {
      await queryInterface.removeColumn('admission_applications', column);
    }
  },
};
