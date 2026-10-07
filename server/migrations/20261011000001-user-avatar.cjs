'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'avatar', { type: Sequelize.TEXT('medium'), allowNull: true });
    await queryInterface.addColumn('users', 'avatar_updated_at', { type: Sequelize.DATE, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'avatar_updated_at');
    await queryInterface.removeColumn('users', 'avatar');
  },
};
