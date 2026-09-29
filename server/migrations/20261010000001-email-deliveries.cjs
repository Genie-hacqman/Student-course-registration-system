'use strict';

/**
 * Email delivery log: one row per logical email (keyed by idempotency_key when the sender gives one),
 * so retries never send twice and failures are visible to admins. `status` distinguishes the provider
 * accepting the email (`sent`) from confirmed delivery (`delivered`, set by the Resend webhook).
 * Message bodies are never stored (they may contain single-use links).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    await queryInterface.createTable('email_deliveries', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      idempotency_key: { type: Sequelize.STRING(191), unique: true },
      template: { type: Sequelize.STRING(60), allowNull: false },
      recipient: { type: Sequelize.STRING(191), allowNull: false },
      subject: { type: Sequelize.STRING(255), allowNull: false },
      user_id: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      entity_type: { type: Sequelize.STRING(50) },
      entity_id: { type: Sequelize.INTEGER },
      provider: { type: Sequelize.STRING(20), allowNull: false },
      provider_message_id: { type: Sequelize.STRING(100) },
      status: {
        type: Sequelize.ENUM('not_configured', 'sent', 'failed', 'delivered', 'delivery_delayed', 'bounced', 'complained'),
        allowNull: false,
      },
      error: { type: Sequelize.STRING(255) },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      last_event_at: { type: Sequelize.DATE },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('email_deliveries', ['provider_message_id']);
    await queryInterface.addIndex('email_deliveries', ['status', 'created_at']);
    await queryInterface.addIndex('email_deliveries', ['user_id']);

    // An announcement is emailed at most once (set when the email fan-out starts).
    await queryInterface.addColumn('announcements', 'emailed_at', { type: Sequelize.DATE });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('announcements', 'emailed_at');
    await queryInterface.dropTable('email_deliveries');
  },
};
