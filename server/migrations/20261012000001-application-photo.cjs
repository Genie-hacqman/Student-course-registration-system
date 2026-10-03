'use strict';

/**
 * The official application photo belongs to the application (not to the user's profile picture, which is
 * `users.avatar` and can change freely). The image itself is in private object storage; the row keeps only
 * its key plus integrity and lock metadata. Additive and nullable: nothing existing is changed or removed.
 *
 *  - photo_key          object key, e.g. applications/2026/123/official-photo/<uuid>.jpg (never a URL)
 *  - photo_sha256       fingerprint of the stored bytes (evidence the identity photo was not altered)
 *  - photo_uploaded_at  when the current photo was stored
 *  - photo_locked_at    set in the same transaction that submits the application; once set, never editable
 */
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
