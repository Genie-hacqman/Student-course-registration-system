'use strict';

/**
 * A ~48px thumbnail (about 2 KB) beside the full profile picture, so list pages can show faces without
 * sending ~25 KB per row. Optional: people who uploaded before this migration keep initials in lists
 * until they next change their picture.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'avatar_thumb', { type: Sequelize.TEXT, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'avatar_thumb');
  },
};
