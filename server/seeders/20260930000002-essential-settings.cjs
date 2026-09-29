'use strict';

/**
 * The application's default settings — safe to run against production.
 * This is the single canonical place these keys are seeded; no other seeder inserts them.
 * Uses INSERT IGNORE so it is safe to run against a database that already has some of these rows
 * (e.g. an existing dev database seeded before this file existed).
 */
const DEFAULTS = [
  { key: 'registration.requireApproval', value: true, description: 'Submitted registrations need registrar approval' },
  { key: 'registration.defaultMaxCredits', value: 24, description: 'Fallback credit limit when semester and program do not set one' },
  { key: 'registration.waitlistEnabled', value: true, description: 'Offer waitlists for full sections (each section can also opt out)' },
  { key: 'grades.passingGrade', value: 'D', description: 'Lowest grade that counts as a pass' },
  { key: 'institution.name', value: 'Student Course Registration System', description: 'Printed on registration slips and shown in the UI' },
  // Deliberately empty: admission refuses to run until the institution sets its real domain.
  { key: 'institution.studentEmailDomain', value: '', description: 'Domain of admitted students\' school email addresses, e.g. school.edu.gh' },
  // Empty: lecturer school emails must then be entered by hand when creating a lecturer.
  { key: 'institution.staffEmailDomain', value: '', description: 'Domain for generated staff school emails (first.last@domain), e.g. staff.school.edu.gh' },
  { key: 'teaching.restrictLecturerDepartment', value: true, description: 'Lecturers may only be assigned to courses of their own department' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    for (const setting of DEFAULTS) {
      await queryInterface.sequelize.query(
        'INSERT IGNORE INTO settings (`key`, value, description, created_at, updated_at) VALUES (:key, :value, :description, :now, :now)',
        { replacements: { ...setting, value: JSON.stringify(setting.value), now } },
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('settings', { key: DEFAULTS.map((d) => d.key) });
  },
};
