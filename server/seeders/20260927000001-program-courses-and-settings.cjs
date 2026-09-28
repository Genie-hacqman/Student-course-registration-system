'use strict';

/** Demo-only: puts every seeded course on the BSC-CS curriculum. Never run this in production. */
module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to run a demo seeder in production. Use `npm run db:seed` (roles + essential settings only).');
    }

    const now = new Date();
    const [[program]] = await queryInterface.sequelize.query("SELECT id FROM programs WHERE code = 'BSC-CS'");
    if (program) {
      const [courses] = await queryInterface.sequelize.query('SELECT id, code, level FROM courses');
      const electives = new Set(['CS204']);
      if (courses.length) {
        await queryInterface.bulkInsert('program_courses', courses.map((c) => ({
          program_id: program.id,
          course_id: c.id,
          type: electives.has(c.code) ? 'elective' : 'core',
          recommended_level: c.level,
          created_at: now,
          updated_at: now,
        })));
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('program_courses', null, {});
  },
};
