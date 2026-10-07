'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('admission_applications', 'photo_key', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn('admission_applications', 'photo_sha256', { type: Sequelize.CHAR(64), allowNull: true });
    await queryInterface.addColumn('admission_applications', 'photo_uploaded_at', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('admission_applications', 'photo_locked_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('admission_applications', 'photo_locked_at');
    await queryInterface.removeColumn('admission_applications', 'photo_uploaded_at');
    await queryInterface.removeColumn('admission_applications', 'photo_sha256');
    await queryInterface.removeColumn('admission_applications', 'photo_key');
  },
};
