'use strict';

/**
 * Demo data so the API can be exercised end to end right after seeding.
 * The current semester's registration window is computed relative to "now", so it is always open.
 *
 * Accounts:
 *   student@scrs.local  / Student@12345   (level 200, has passed CS101 and MATH101)
 *   lecturer@scrs.local / Lecturer@12345
 *   registrar@scrs.local / Registrar@12345
 */
const bcrypt = require('bcryptjs');

const DAY = 24 * 60 * 60 * 1000;

module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Refusing to run a demo seeder in production — it creates accounts with published passwords. '
          + 'Use `npm run db:seed` (roles + essential settings only).',
      );
    }

    const q = queryInterface.sequelize;
    const now = new Date();
    const t = now.getTime();
    const ts = { created_at: now, updated_at: now };
    const idOf = async (sql) => (await q.query(sql))[0][0].id;

    // Departments & programs
    await queryInterface.bulkInsert('departments', [
      { name: 'Computer Science', code: 'CS', ...ts },
      { name: 'Mathematics', code: 'MATH', ...ts },
    ]);
    const csDept = await idOf("SELECT id FROM departments WHERE code = 'CS'");
    const mathDept = await idOf("SELECT id FROM departments WHERE code = 'MATH'");

    await queryInterface.bulkInsert('programs', [
      { department_id: csDept, name: 'BSc Computer Science', code: 'BSC-CS', duration_years: 4, max_credits: 18, ...ts },
    ]);
    const program = await idOf("SELECT id FROM programs WHERE code = 'BSC-CS'");

    // Users
    const roleId = async (name) => idOf(`SELECT id FROM roles WHERE name = '${name}'`);
    await queryInterface.bulkInsert('users', [
      { role_id: await roleId('USER'), first_name: 'Ama', last_name: 'Mensah', email: 'student@scrs.local', password_hash: await bcrypt.hash('Student@12345', 12), status: 'active', email_verified_at: ts.created_at, ...ts },
      { role_id: await roleId('LECTURER'), first_name: 'Kofi', last_name: 'Owusu', email: 'lecturer@scrs.local', password_hash: await bcrypt.hash('Lecturer@12345', 12), status: 'active', email_verified_at: ts.created_at, ...ts },
      { role_id: await roleId('REGISTRAR'), first_name: 'Esi', last_name: 'Boateng', email: 'registrar@scrs.local', password_hash: await bcrypt.hash('Registrar@12345', 12), status: 'active', email_verified_at: ts.created_at, ...ts },
    ]);
    const studentUser = await idOf("SELECT id FROM users WHERE email = 'student@scrs.local'");
    const lecturerUser = await idOf("SELECT id FROM users WHERE email = 'lecturer@scrs.local'");

    await queryInterface.bulkInsert('students', [
      { user_id: studentUser, program_id: program, student_number: 'STU2025001', level: 200, admission_year: now.getUTCFullYear() - 1, status: 'active', academic_hold: false, ...ts },
    ]);
    await queryInterface.bulkInsert('lecturers', [
      { user_id: lecturerUser, department_id: csDept, staff_number: 'STF1001', title: 'Dr.', ...ts },
    ]);
    const student = await idOf(`SELECT id FROM students WHERE user_id = ${studentUser}`);
    const lecturer = await idOf(`SELECT id FROM lecturers WHERE user_id = ${lecturerUser}`);

    // Academic year & semesters
    const year = now.getUTCFullYear();
    await queryInterface.bulkInsert('academic_years', [
      { name: `${year}/${year + 1}`, start_date: `${year}-01-01`, end_date: `${year + 1}-12-31`, ...ts },
    ]);
    const academicYear = await idOf(`SELECT id FROM academic_years WHERE name = '${year}/${year + 1}'`);

    await queryInterface.bulkInsert('semesters', [
      {
        academic_year_id: academicYear, name: 'Previous Semester',
        start_date: new Date(t - 200 * DAY), end_date: new Date(t - 60 * DAY),
        registration_start: new Date(t - 220 * DAY), registration_end: new Date(t - 190 * DAY),
        add_drop_end: new Date(t - 180 * DAY), max_credits: 18, min_credits: 0,
        is_current: false, status: 'completed', ...ts,
      },
      {
        academic_year_id: academicYear, name: 'Current Semester',
        start_date: new Date(t + 14 * DAY), end_date: new Date(t + 130 * DAY),
        registration_start: new Date(t - 7 * DAY), registration_end: new Date(t + 30 * DAY),
        add_drop_end: new Date(t + 45 * DAY), max_credits: 18, min_credits: 6,
        is_current: true, status: 'active', ...ts,
      },
    ]);
    const prevSemester = await idOf("SELECT id FROM semesters WHERE name = 'Previous Semester'");
    const semester = await idOf("SELECT id FROM semesters WHERE is_current = 1");

    // Courses
    const courses = [
      [csDept, 'CS101', 'Introduction to Programming', 3, 100],
      [mathDept, 'MATH101', 'Calculus I', 3, 100],
      [csDept, 'CS201', 'Data Structures', 3, 200],
      [csDept, 'CS202', 'Algorithms', 3, 200],
      [csDept, 'CS203', 'Database Systems', 3, 200],
      [csDept, 'CS204', 'Computer Networks', 3, 200],
      [mathDept, 'MATH201', 'Linear Algebra', 3, 200],
      [csDept, 'CS301', 'Operating Systems', 3, 300],
    ];
    await queryInterface.bulkInsert('courses', courses.map(([department_id, code, title, credits, level]) => ({
      department_id, code, title, credits, level, status: 'active', description: `${title} (${code})`, ...ts,
    })));
    const [courseRows] = await q.query('SELECT id, code FROM courses');
    const c = Object.fromEntries(courseRows.map((r) => [r.code, r.id]));

    await queryInterface.bulkInsert('course_prerequisites', [
      { course_id: c.CS201, prerequisite_course_id: c.CS101, ...ts },
      { course_id: c.CS202, prerequisite_course_id: c.CS201, ...ts },
      { course_id: c.CS202, prerequisite_course_id: c.MATH101, ...ts },
      { course_id: c.CS203, prerequisite_course_id: c.CS101, ...ts },
      { course_id: c.MATH201, prerequisite_course_id: c.MATH101, ...ts },
      { course_id: c.CS301, prerequisite_course_id: c.CS201, ...ts },
    ]);

    // Past results: the demo student has passed CS101 and MATH101
    await queryInterface.bulkInsert('results', [
      { student_id: student, course_id: c.CS101, semester_id: prevSemester, grade: 'A', grade_point: 4.0, passed: true, ...ts },
      { student_id: student, course_id: c.MATH101, semester_id: prevSemester, grade: 'B', grade_point: 3.0, passed: true, ...ts },
    ]);

    // Sections for the current semester
    const sections = [
      ['CS201', 40], ['CS202', 40], ['CS203', 35], ['CS204', 30], ['MATH201', 50], ['CS301', 25],
    ];
    // CS204 is left unassigned: it overlaps CS203 on Wednesday (a student clash, on purpose), and one
    // lecturer teaching both would be a double booking that approval's timetable check refuses.
    await queryInterface.bulkInsert('course_sections', sections.map(([code, capacity]) => ({
      course_id: c[code], semester_id: semester, lecturer_id: code.startsWith('CS') && code !== 'CS204' ? lecturer : null,
      section_code: 'A', capacity, seats_taken: 0, status: 'open', ...ts,
    })));
    const [sectionRows] = await q.query(
      `SELECT s.id, c.code FROM course_sections s JOIN courses c ON c.id = s.course_id WHERE s.semester_id = ${semester}`,
    );
    const s = Object.fromEntries(sectionRows.map((r) => [r.code, r.id]));

    // CS203 and CS204 deliberately clash on Wednesday to demo conflict detection.
    await queryInterface.bulkInsert('schedules', [
      { course_section_id: s.CS201, day: 'MON', start_time: '08:00', end_time: '10:00', room: 'LT-1', ...ts },
      { course_section_id: s.CS201, day: 'THU', start_time: '08:00', end_time: '09:00', room: 'LT-1', ...ts },
      { course_section_id: s.CS202, day: 'TUE', start_time: '10:00', end_time: '12:00', room: 'LT-2', ...ts },
      { course_section_id: s.CS203, day: 'WED', start_time: '13:00', end_time: '15:00', room: 'LAB-1', ...ts },
      { course_section_id: s.CS204, day: 'WED', start_time: '14:00', end_time: '16:00', room: 'LT-3', ...ts },
      { course_section_id: s.MATH201, day: 'FRI', start_time: '09:00', end_time: '11:00', room: 'LT-4', ...ts },
      { course_section_id: s.CS301, day: 'MON', start_time: '13:00', end_time: '15:00', room: 'LT-2', ...ts },
    ]);
  },

  async down(queryInterface) {
    const tables = [
      'schedules', 'registration_items', 'registrations', 'waitlists', 'course_sections', 'results',
      'course_prerequisites', 'courses', 'semesters', 'academic_years', 'lecturers', 'students',
    ];
    for (const table of tables) await queryInterface.bulkDelete(table, null, {});
    await queryInterface.bulkDelete('users', { email: ['student@scrs.local', 'lecturer@scrs.local', 'registrar@scrs.local'] });
    await queryInterface.bulkDelete('programs', null, {});
    await queryInterface.bulkDelete('departments', null, {});
  },
};
