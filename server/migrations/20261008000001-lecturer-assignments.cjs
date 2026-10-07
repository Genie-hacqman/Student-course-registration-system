'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };

    await queryInterface.addColumn('lecturers', 'phone', { type: Sequelize.STRING(30), after: 'title' });
    await queryInterface.addColumn('lecturers', 'specialization', { type: Sequelize.STRING(150), after: 'phone' });
    await queryInterface.addColumn('lecturers', 'personal_email', { type: Sequelize.STRING(191), after: 'specialization' });
    await queryInterface.addIndex('lecturers', ['personal_email'], { unique: true, name: 'lecturers_personal_email' });

    await queryInterface.createTable('section_lecturer_assignments', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      course_section_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'course_sections', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      lecturer_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'lecturers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      status: { type: Sequelize.ENUM('active', 'ended'), allowNull: false, defaultValue: 'active' },
      assigned_by: {
        type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      assigned_at: { type: Sequelize.DATE, allowNull: false },
      ended_by: {
        type: Sequelize.INTEGER, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      ended_at: { type: Sequelize.DATE },
      end_reason: { type: Sequelize.STRING(255) },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('section_lecturer_assignments', ['course_section_id', 'status']);
    await queryInterface.addIndex('section_lecturer_assignments', ['lecturer_id', 'status']);

    await queryInterface.sequelize.query(
      `INSERT INTO section_lecturer_assignments (course_section_id, lecturer_id, status, assigned_at, created_at, updated_at)
       SELECT id, lecturer_id, 'active', updated_at, NOW(), NOW() FROM course_sections WHERE lecturer_id IS NOT NULL`,
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('section_lecturer_assignments');
    await queryInterface.removeIndex('lecturers', 'lecturers_personal_email');
    for (const column of ['personal_email', 'specialization', 'phone']) await queryInterface.removeColumn('lecturers', column);
  },
};
