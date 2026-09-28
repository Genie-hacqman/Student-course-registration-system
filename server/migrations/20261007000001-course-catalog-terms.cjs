'use strict';

/**
 * Curriculum terms: which term of the academic year a semester is, and on a programme's curriculum,
 * which term a course is taught in and the academic year the entry takes effect from. All nullable:
 * NULL means "no restriction", so existing semesters and curricula behave exactly as before.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('semesters', 'term', { type: Sequelize.TINYINT, after: 'name' });
    await queryInterface.addColumn('program_courses', 'semester', { type: Sequelize.TINYINT, after: 'recommended_level' });
    await queryInterface.addColumn('program_courses', 'academic_year_id', {
      type: Sequelize.INTEGER,
      after: 'semester',
      references: { model: 'academic_years', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('program_courses', 'academic_year_id');
    await queryInterface.removeColumn('program_courses', 'semester');
    await queryInterface.removeColumn('semesters', 'term');
  },
};
