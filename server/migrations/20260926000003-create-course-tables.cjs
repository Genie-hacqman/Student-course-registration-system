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
    await queryInterface.createTable('courses', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      department_id: fk(Sequelize, 'departments'),
      code: { type: Sequelize.STRING(20), allowNull: false, unique: true },
      title: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT },
      credits: { type: Sequelize.INTEGER, allowNull: false },
      level: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.ENUM('active', 'inactive'), allowNull: false, defaultValue: 'active' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('courses', ['department_id']);
    await queryInterface.addIndex('courses', ['level']);
    await queryInterface.addIndex('courses', ['status']);

    await queryInterface.createTable('course_prerequisites', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      course_id: fk(Sequelize, 'courses', { onDelete: 'CASCADE' }),
      prerequisite_course_id: fk(Sequelize, 'courses', { onDelete: 'CASCADE' }),
      ...timestamps(Sequelize),
    });
    await queryInterface.addConstraint('course_prerequisites', {
      fields: ['course_id', 'prerequisite_course_id'],
      type: 'unique',
      name: 'course_prerequisites_pair_unique',
    });
    // "Not its own prerequisite" and cycle checks live in prerequisite.service.js:
    // MySQL forbids CHECK constraints on columns with FK referential actions.

    await queryInterface.createTable('course_sections', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      course_id: fk(Sequelize, 'courses'),
      semester_id: fk(Sequelize, 'semesters'),
      lecturer_id: fk(Sequelize, 'lecturers', { allowNull: true, onDelete: 'SET NULL' }),
      section_code: { type: Sequelize.STRING(10), allowNull: false, defaultValue: 'A' },
      capacity: { type: Sequelize.INTEGER, allowNull: false },
      seats_taken: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      status: { type: Sequelize.ENUM('open', 'closed', 'cancelled'), allowNull: false, defaultValue: 'open' },
      ...timestamps(Sequelize),
    });
    await queryInterface.addConstraint('course_sections', {
      fields: ['course_id', 'semester_id', 'section_code'],
      type: 'unique',
      name: 'course_sections_course_semester_code_unique',
    });
    await queryInterface.addIndex('course_sections', ['semester_id']);
    await queryInterface.addIndex('course_sections', ['lecturer_id']);
    await queryInterface.sequelize.query(
      'ALTER TABLE course_sections ADD CONSTRAINT course_sections_seats_valid CHECK (seats_taken >= 0 AND seats_taken <= capacity)',
    );

    await queryInterface.createTable('schedules', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      course_section_id: fk(Sequelize, 'course_sections', { onDelete: 'CASCADE' }),
      day: { type: Sequelize.ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'), allowNull: false },
      start_time: { type: Sequelize.TIME, allowNull: false },
      end_time: { type: Sequelize.TIME, allowNull: false },
      room: { type: Sequelize.STRING(50) },
      ...timestamps(Sequelize),
    });
    await queryInterface.addIndex('schedules', ['course_section_id']);
    await queryInterface.addIndex('schedules', ['day', 'room']);
    await queryInterface.sequelize.query(
      'ALTER TABLE schedules ADD CONSTRAINT schedules_time_order CHECK (start_time < end_time)',
    );

    await queryInterface.createTable('results', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: fk(Sequelize, 'students', { onDelete: 'CASCADE' }),
      course_id: fk(Sequelize, 'courses'),
      semester_id: fk(Sequelize, 'semesters', { allowNull: true }),
      grade: { type: Sequelize.STRING(5), allowNull: false },
      grade_point: { type: Sequelize.DECIMAL(3, 2) },
      passed: { type: Sequelize.BOOLEAN, allowNull: false },
      ...timestamps(Sequelize),
    });
    await queryInterface.addConstraint('results', {
      fields: ['student_id', 'course_id', 'semester_id'],
      type: 'unique',
      name: 'results_student_course_semester_unique',
    });
    await queryInterface.addIndex('results', ['course_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('results');
    await queryInterface.dropTable('schedules');
    await queryInterface.dropTable('course_sections');
    await queryInterface.dropTable('course_prerequisites');
    await queryInterface.dropTable('courses');
  },
};
