'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') };
    const ref = (table, onDelete = 'CASCADE', allowNull = false) => ({
      type: Sequelize.INTEGER, allowNull,
      references: { model: table, key: 'id' }, onUpdate: 'CASCADE', onDelete,
    });

    await queryInterface.createTable('role_permission_overrides', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      role_id: ref('roles'),
      permission: { type: Sequelize.STRING(50), allowNull: false },
      granted: { type: Sequelize.BOOLEAN, allowNull: false },
      updated_by: ref('users', 'SET NULL', true),
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('role_permission_overrides', ['role_id', 'permission'], { unique: true });

    await queryInterface.createTable('attendance_sessions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      course_section_id: ref('course_sections'),
      schedule_id: ref('schedules', 'SET NULL', true),
      date: { type: Sequelize.DATEONLY, allowNull: false },
      topic: { type: Sequelize.STRING(200) },
      taken_by: ref('users', 'SET NULL', true),
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('attendance_sessions', ['course_section_id', 'date']);

    await queryInterface.createTable('attendance_records', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      attendance_session_id: ref('attendance_sessions'),
      student_id: ref('students'),
      status: { type: Sequelize.ENUM('present', 'absent', 'late', 'excused'), allowNull: false, defaultValue: 'present' },
      remark: { type: Sequelize.STRING(255) },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('attendance_records', ['attendance_session_id', 'student_id'], { unique: true });
    await queryInterface.addIndex('attendance_records', ['student_id']);

    await queryInterface.createTable('assessments', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      course_section_id: ref('course_sections'),
      title: { type: Sequelize.STRING(150), allowNull: false },
      type: { type: Sequelize.ENUM('quiz', 'assignment', 'midterm', 'exam', 'project', 'other'), allowNull: false },
      description: { type: Sequelize.TEXT },
      max_score: { type: Sequelize.DECIMAL(6, 2), allowNull: false },
      weight: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      due_at: { type: Sequelize.DATE },
      status: { type: Sequelize.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
      published_at: { type: Sequelize.DATE },
      created_by: ref('users', 'SET NULL', true),
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('assessments', ['course_section_id', 'status']);

    await queryInterface.createTable('assessment_scores', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      assessment_id: ref('assessments'),
      student_id: ref('students'),
      score: { type: Sequelize.DECIMAL(6, 2) },
      feedback: { type: Sequelize.STRING(500) },
      graded_by: ref('users', 'SET NULL', true),
      graded_at: { type: Sequelize.DATE },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('assessment_scores', ['assessment_id', 'student_id'], { unique: true });

    await queryInterface.createTable('announcements', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      author_id: ref('users'),
      title: { type: Sequelize.STRING(200), allowNull: false },
      body: { type: Sequelize.TEXT, allowNull: false },
      audience: {
        type: Sequelize.ENUM('section', 'program', 'all_students', 'all_lecturers', 'all_staff', 'everyone'),
        allowNull: false,
      },
      course_section_id: ref('course_sections', 'CASCADE', true),
      program_id: ref('programs', 'CASCADE', true),
      pinned: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      recipient_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: now,
      updated_at: now,
    });
    await queryInterface.addIndex('announcements', ['audience', 'created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('announcements');
    await queryInterface.dropTable('assessment_scores');
    await queryInterface.dropTable('assessments');
    await queryInterface.dropTable('attendance_records');
    await queryInterface.dropTable('attendance_sessions');
    await queryInterface.dropTable('role_permission_overrides');
  },
};
