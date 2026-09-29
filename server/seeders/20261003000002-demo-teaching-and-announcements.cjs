'use strict';

/**
 * Demo-only — never run this in production:
 * - two CS201 assessments (one published, one draft) for the demo lecturer
 * - a campus-wide announcement from the admin and a CS201 announcement from the lecturer
 * No attendance: the demo semester starts after seed time, so there are no past classes to record.
 */
module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run a demo seeder in production. Use `npm run db:seed` (roles + essential settings only).');
    }

    const q = queryInterface.sequelize;
    const now = new Date();
    const DAY = 86_400_000;
    const ts = { created_at: now, updated_at: now };

    const [[section]] = await q.query(
      `SELECT s.id, s.semester_id FROM course_sections s JOIN courses c ON c.id = s.course_id
        JOIN semesters m ON m.id = s.semester_id WHERE c.code = 'CS201' AND m.is_current = 1 LIMIT 1`,
    );
    const [[lecturer]] = await q.query("SELECT id FROM users WHERE email = 'lecturer@scrs.local'");
    const [[admin]] = await q.query(
      "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'ADMIN' ORDER BY u.id LIMIT 1",
    );
    if (!section || !lecturer) return; // demo academic data not seeded

    await queryInterface.bulkInsert('assessments', [
      {
        course_section_id: section.id, title: 'Quiz 1: Arrays and linked lists', type: 'quiz',
        description: 'Short in-class quiz on the first two weeks.', max_score: 20, weight: 10,
        due_at: new Date(now.getTime() + 21 * DAY), status: 'published', published_at: now, created_by: lecturer.id, ...ts,
      },
      {
        course_section_id: section.id, title: 'Assignment 1: Stack implementation', type: 'assignment',
        description: 'Implement a stack with push, pop and peek, with tests.', max_score: 100, weight: 15,
        due_at: new Date(now.getTime() + 35 * DAY), status: 'draft', created_by: lecturer.id, ...ts,
      },
    ]);

    const announcements = [{
      author_id: lecturer.id, title: 'Welcome to CS201',
      body: 'Welcome to Data Structures. Please review the course outline before our first class and bring a laptop.',
      audience: 'section', course_section_id: section.id, pinned: false, recipient_count: 0, ...ts,
    }];
    if (admin) {
      announcements.push({
        author_id: admin.id, title: 'Course registration is open',
        body: 'Registration for the new semester is open. Submit your registration before the deadline to secure your seats.',
        audience: 'everyone', pinned: true, recipient_count: 0, ...ts,
      });
    }
    await queryInterface.bulkInsert('announcements', announcements);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('announcements', null, {});
    await queryInterface.bulkDelete('assessments', null, {});
  },
};
