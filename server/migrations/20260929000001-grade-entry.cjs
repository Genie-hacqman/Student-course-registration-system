'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('results', 'course_section_id', {
      type: Sequelize.INTEGER,
      references: { model: 'course_sections', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'semester_id',
    });
    await queryInterface.addColumn('results', 'status', {
      type: Sequelize.ENUM('provisional', 'final'),
      allowNull: false,
      defaultValue: 'final',
      after: 'passed',
    });
    await queryInterface.addColumn('results', 'entered_by', {
      type: Sequelize.INTEGER,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
      after: 'status',
    });
    await queryInterface.addColumn('results', 'finalized_at', { type: Sequelize.DATE, after: 'entered_by' });
    await queryInterface.addIndex('results', ['student_id', 'status']);
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('results', ['student_id', 'status']);
    for (const column of ['finalized_at', 'entered_by', 'status', 'course_section_id']) {
      await queryInterface.removeColumn('results', column);
    }
  },
};
