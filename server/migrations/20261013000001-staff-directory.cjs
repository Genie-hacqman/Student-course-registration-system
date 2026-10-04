'use strict';

/**
 * Staff directory: organise people by department.
 *  - departments.status / programs.status: `archived` means closed to new intake (no new programmes, courses,
 *    lecturers, applications or admissions under it); everything already there stays visible. Default `active`.
 *  - lecturer_departments: a lecturer's ADDITIONAL departments (joint appointments). The home department stays in
 *    lecturers.department_id and is never duplicated here.
 *  - Indexes for the new directory filters (students by programme+level and status, users by status).
 * Additive and reversible: no existing data is changed.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const status = { type: Sequelize.ENUM('active', 'archived'), allowNull: false, defaultValue: 'active' };
    await queryInterface.addColumn('departments', 'status', status);
    await queryInterface.addIndex('departments', ['status']);
    await queryInterface.addColumn('programs', 'status', status);
    await queryInterface.addIndex('programs', ['status']);

    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    await queryInterface.createTable('lecturer_departments', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      lecturer_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'lecturers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      department_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'departments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('lecturer_departments', ['lecturer_id', 'department_id'], { unique: true, name: 'lecturer_departments_unique' });
    await queryInterface.addIndex('lecturer_departments', ['department_id']);

    await queryInterface.addIndex('students', ['program_id', 'level'], { name: 'students_program_level' });
    await queryInterface.addIndex('students', ['status'], { name: 'students_status' });
    await queryInterface.addIndex('users', ['status'], { name: 'users_status' });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'users_status');
    await queryInterface.removeIndex('students', 'students_status');
    await queryInterface.removeIndex('students', 'students_program_level');
    await queryInterface.dropTable('lecturer_departments');
    await queryInterface.removeIndex('programs', ['status']);
    await queryInterface.removeColumn('programs', 'status');
    await queryInterface.removeIndex('departments', ['status']);
    await queryInterface.removeColumn('departments', 'status');
    // MySQL drops an ENUM with its column; nothing else to clean up.
  },
};
