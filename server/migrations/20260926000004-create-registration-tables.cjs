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
    await queryInterface.createTable('registrations', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: fk(Sequelize, 'students', { onDelete: 'CASCADE' }),
      semester_id: fk(Sequelize, 'semesters'),
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      total_credits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      submitted_at: { type: Sequelize.DATE },
      reviewed_at: { type: Sequelize.DATE },
      reviewed_by: fk(Sequelize, 'users', { allowNull: true, onDelete: 'SET NULL' }),
      remarks: { type: Sequelize.STRING(500) },
      ...timestamps(Sequelize),
    });
    await queryInterface.addConstraint('registrations', {
      fields: ['student_id', 'semester_id'],
      type: 'unique',
      name: 'registrations_student_semester_unique',
    });
    await queryInterface.addIndex('registrations', ['semester_id', 'status']);

    await queryInterface.createTable('registration_items', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      registration_id: fk(Sequelize, 'registrations', { onDelete: 'CASCADE' }),
      course_section_id: fk(Sequelize, 'course_sections'),
      course_id: fk(Sequelize, 'courses'),
      credits: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.ENUM('registered', 'dropped'), allowNull: false, defaultValue: 'registered' },
      dropped_at: { type: Sequelize.DATE },
      ...timestamps(Sequelize),
    });
    await queryInterface.addConstraint('registration_items', {
      fields: ['registration_id', 'course_section_id'],
      type: 'unique',
      name: 'registration_items_registration_section_unique',
    });
    await queryInterface.addIndex('registration_items', ['course_section_id', 'status']);
    await queryInterface.addIndex('registration_items', ['registration_id', 'course_id']);

    await queryInterface.createTable('waitlists', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      student_id: fk(Sequelize, 'students', { onDelete: 'CASCADE' }),
      course_section_id: fk(Sequelize, 'course_sections', { onDelete: 'CASCADE' }),
      position: { type: Sequelize.INTEGER, allowNull: false },
      status: {
        type: Sequelize.ENUM('waiting', 'notified', 'converted', 'cancelled'),
        allowNull: false,
        defaultValue: 'waiting',
      },
      notified_at: { type: Sequelize.DATE },
      ...timestamps(Sequelize),
    });
    await queryInterface.addConstraint('waitlists', {
      fields: ['student_id', 'course_section_id'],
      type: 'unique',
      name: 'waitlists_student_section_unique',
    });
    await queryInterface.addIndex('waitlists', ['course_section_id', 'status', 'position']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('waitlists');
    await queryInterface.dropTable('registration_items');
    await queryInterface.dropTable('registrations');
  },
};
