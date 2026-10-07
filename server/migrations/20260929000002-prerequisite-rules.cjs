'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('course_prerequisites', 'type', {
      type: Sequelize.ENUM('prerequisite', 'corequisite'),
      allowNull: false,
      defaultValue: 'prerequisite',
      after: 'prerequisite_course_id',
    });
    await queryInterface.addColumn('course_prerequisites', 'min_grade', { type: Sequelize.STRING(2), after: 'type' });
    await queryInterface.addColumn('course_prerequisites', 'group_no', { type: Sequelize.INTEGER, after: 'min_grade' });
    await queryInterface.addIndex('course_prerequisites', ['course_id', 'type', 'group_no']);

    await queryInterface.createTable('prerequisite_overrides', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'students', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      course_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'courses', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      semester_id: {
        type: Sequelize.INTEGER,
        references: { model: 'semesters', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      granted_by: {
        type: Sequelize.INTEGER,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('prerequisite_overrides', {
      fields: ['student_id', 'course_id', 'semester_id'],
      type: 'unique',
      name: 'prerequisite_overrides_student_course_semester_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('prerequisite_overrides');
    await queryInterface.removeIndex('course_prerequisites', ['course_id', 'type', 'group_no']);
    for (const column of ['group_no', 'min_grade', 'type']) {
      await queryInterface.removeColumn('course_prerequisites', column);
    }
  },
};
