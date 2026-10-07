'use strict';

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
