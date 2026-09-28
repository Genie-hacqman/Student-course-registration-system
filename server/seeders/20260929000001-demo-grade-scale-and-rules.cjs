'use strict';

/**
 * Demo-only — never run this in production:
 * - CS202 now needs CS201 with at least a C
 * - CS301L lab, a corequisite of CS301 (and vice versa), on the BSC-CS curriculum with a section
 */
module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run a demo seeder in production. Use `npm run db:seed` (roles + essential settings only).');
    }

    const q = queryInterface.sequelize;
    const now = new Date();
    const ts = { created_at: now, updated_at: now };

    const [courses] = await q.query("SELECT id, code FROM courses WHERE code IN ('CS201', 'CS202', 'CS301')");
    const c = Object.fromEntries(courses.map((r) => [r.code, r.id]));
    if (!c.CS301) return; // demo academic data not seeded

    await q.query(
      "UPDATE course_prerequisites SET min_grade = 'C' WHERE course_id = :cs202 AND prerequisite_course_id = :cs201",
      { replacements: { cs202: c.CS202, cs201: c.CS201 } },
    );

    const [[cs]] = await q.query("SELECT id FROM departments WHERE code = 'CS'");
    await queryInterface.bulkInsert('courses', [{
      department_id: cs.id, code: 'CS301L', title: 'Operating Systems Lab', description: 'Lab for CS301',
      credits: 1, level: 300, status: 'active', ...ts,
    }]);
    const [[lab]] = await q.query("SELECT id FROM courses WHERE code = 'CS301L'");

    await queryInterface.bulkInsert('course_prerequisites', [
      { course_id: c.CS301, prerequisite_course_id: lab.id, type: 'corequisite', group_no: 1000, ...ts },
      { course_id: lab.id, prerequisite_course_id: c.CS301, type: 'corequisite', group_no: 1000, ...ts },
    ]);

    const [[program]] = await q.query("SELECT id FROM programs WHERE code = 'BSC-CS'");
    await queryInterface.bulkInsert('program_courses', [{
      program_id: program.id, course_id: lab.id, type: 'core', recommended_level: 300, ...ts,
    }]);

    const [[semester]] = await q.query('SELECT id FROM semesters WHERE is_current = 1');
    const [[lecturer]] = await q.query('SELECT id FROM lecturers LIMIT 1');
    await queryInterface.bulkInsert('course_sections', [{
      course_id: lab.id, semester_id: semester.id, lecturer_id: lecturer?.id ?? null, section_code: 'A',
      capacity: 20, seats_taken: 0, status: 'open', waitlist_enabled: true, ...ts,
    }]);
    const [[section]] = await q.query('SELECT id FROM course_sections WHERE course_id = :id', { replacements: { id: lab.id } });
    await queryInterface.bulkInsert('schedules', [{
      course_section_id: section.id, day: 'TUE', start_time: '14:00', end_time: '16:00', room: 'LAB-2', ...ts,
    }]);
  },

  async down(queryInterface) {
    const q = queryInterface.sequelize;
    const [[lab]] = await q.query("SELECT id FROM courses WHERE code = 'CS301L'");
    if (lab) {
      await q.query('DELETE FROM course_prerequisites WHERE course_id = :id OR prerequisite_course_id = :id', { replacements: { id: lab.id } });
      await q.query('DELETE s FROM schedules s JOIN course_sections cs ON cs.id = s.course_section_id WHERE cs.course_id = :id', { replacements: { id: lab.id } });
      await q.query('DELETE FROM course_sections WHERE course_id = :id', { replacements: { id: lab.id } });
      await q.query('DELETE FROM program_courses WHERE course_id = :id', { replacements: { id: lab.id } });
      await q.query('DELETE FROM courses WHERE id = :id', { replacements: { id: lab.id } });
    }
    await q.query('UPDATE course_prerequisites SET min_grade = NULL');
  },
};
