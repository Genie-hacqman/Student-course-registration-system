'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    const fk = (table) => ({
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: table, key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    });

    await queryInterface.createTable('program_courses', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      program_id: fk('programs'),
      course_id: fk('courses'),
      type: { type: Sequelize.ENUM('core', 'elective'), allowNull: false, defaultValue: 'core' },
      recommended_level: { type: Sequelize.INTEGER },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addConstraint('program_courses', {
      fields: ['program_id', 'course_id'],
      type: 'unique',
      name: 'program_courses_program_course_unique',
    });
    await queryInterface.addIndex('program_courses', ['course_id']);

    await queryInterface.addColumn('course_sections', 'waitlist_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      after: 'status',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('course_sections', 'waitlist_enabled');
    await queryInterface.dropTable('program_courses');
  },
};
