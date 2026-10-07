'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    await queryInterface.addColumn('registrations', 'timetable_confirmed_at', { type: Sequelize.DATE, after: 'reviewed_by' });

    await queryInterface.createTable('timetable_issues', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      registration_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'registrations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      course_section_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'course_sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      type: { type: Sequelize.ENUM('STUDENT', 'LECTURER', 'ROOM', 'UNSCHEDULED'), allowNull: false },
      details: { type: Sequelize.JSON },
      status: { type: Sequelize.ENUM('open', 'resolved'), allowNull: false, defaultValue: 'open' },
      detected_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      resolved_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      resolved_at: { type: Sequelize.DATE },
      resolution_note: { type: Sequelize.STRING(500) },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('timetable_issues', ['registration_id', 'course_section_id', 'type'], {
      unique: true, name: 'timetable_issues_registration_section_type',
    });
    await queryInterface.addIndex('timetable_issues', ['status', 'updated_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('timetable_issues');
    await queryInterface.removeColumn('registrations', 'timetable_confirmed_at');
  },
};
