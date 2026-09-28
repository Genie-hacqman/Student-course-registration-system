'use strict';

const timestamps = (Sequelize) => ({
  created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
  updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
});

const fk = (Sequelize, table, { allowNull = false, onDelete = 'RESTRICT' } = {}) => ({
  type: Sequelize.INTEGER,
  allowNull,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete,
});

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('departments', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(150), allowNull: false },
      code: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('programs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      department_id: fk(Sequelize, 'departments'),
      name: { type: Sequelize.STRING(150), allowNull: false },
      code: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      duration_years: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 4 },
      max_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 24 },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('programs', ['department_id']);

    await queryInterface.createTable('students', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: { ...fk(Sequelize, 'users', { onDelete: 'CASCADE' }), unique: true },
      program_id: fk(Sequelize, 'programs'),
      student_number: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 100 },
      admission_year: { type: Sequelize.INTEGER },
      status: {
        type: Sequelize.ENUM('active', 'probation', 'suspended', 'graduated'),
        allowNull: false,
        defaultValue: 'active',
      },
      academic_hold: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('students', ['program_id']);

    await queryInterface.createTable('lecturers', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      user_id: { ...fk(Sequelize, 'users', { onDelete: 'CASCADE' }), unique: true },
      department_id: fk(Sequelize, 'departments'),
      staff_number: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      title: { type: Sequelize.STRING(50) },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('lecturers', ['department_id']);

    await queryInterface.createTable('academic_years', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      name: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      start_date: { type: Sequelize.DATEONLY, allowNull: false },
      end_date: { type: Sequelize.DATEONLY, allowNull: false },
      ...timestamps(Sequelize),
    });

    await queryInterface.createTable('semesters', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      academic_year_id: fk(Sequelize, 'academic_years'),
      name: { type: Sequelize.STRING(50), allowNull: false },
      start_date: { type: Sequelize.DATEONLY, allowNull: false },
      end_date: { type: Sequelize.DATEONLY, allowNull: false },
      registration_start: { type: Sequelize.DATE, allowNull: false },
      registration_end: { type: Sequelize.DATE, allowNull: false },
      add_drop_end: { type: Sequelize.DATE },
      max_credits: { type: Sequelize.INTEGER },
      min_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_current: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      status: { type: Sequelize.ENUM('upcoming', 'active', 'completed'), allowNull: false, defaultValue: 'upcoming' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('semesters', ['academic_year_id']);
    await queryInterface.addIndex('semesters', ['is_current']);
    await queryInterface.addConstraint('semesters', {
      fields: ['academic_year_id', 'name'],
      type: 'unique',
      name: 'semesters_year_name_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('semesters');
    await queryInterface.dropTable('academic_years');
    await queryInterface.dropTable('lecturers');
    await queryInterface.dropTable('students');
    await queryInterface.dropTable('programs');
    await queryInterface.dropTable('departments');
  },
};
